package rtsp

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"net/url"
	"strconv"
	"strings"
	"time"
)

var DefaultPaths = []string{
	"/",
	"/stream",
	"/stream1",
	"/live",
	"/h264",
	"/Streaming/Channels/101",
	"/Streaming/Channels/1",
	"/cam/realmonitor?channel=1&subtype=0",
	"/h264/ch1/main/av_stream",
	"/media/video1",
	"/onvif1",
	"/unicast",
}

// ProbeResult is only returned when DESCRIBE succeeded with an SDP video track.
type ProbeResult struct {
	URL      string
	Path     string
	Brand    string
	HasVideo bool
}

func tcpOpen(host string, port int, timeout time.Duration) bool {
	c, err := net.DialTimeout("tcp", net.JoinHostPort(host, strconv.Itoa(port)), timeout)
	if err != nil {
		return false
	}
	_ = c.Close()
	return true
}

func PortOpen(host string, port int) bool {
	return tcpOpen(host, port, 280*time.Millisecond)
}

func request(conn net.Conn, method, rtspURL string, headers map[string]string) (int, string, error) {
	var b strings.Builder
	fmt.Fprintf(&b, "%s %s RTSP/1.0\r\n", method, rtspURL)
	fmt.Fprintf(&b, "CSeq: 1\r\n")
	fmt.Fprintf(&b, "User-Agent: HubSight-Hawkeyes/1.0\r\n")
	for k, v := range headers {
		fmt.Fprintf(&b, "%s: %s\r\n", k, v)
	}
	b.WriteString("\r\n")
	if _, err := io.WriteString(conn, b.String()); err != nil {
		return 0, "", err
	}

	reader := bufio.NewReader(conn)
	statusLine, err := reader.ReadString('\n')
	if err != nil {
		return 0, "", err
	}
	code := parseStatus(statusLine)
	headersBuf := map[string]string{}
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return code, "", err
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			break
		}
		k, v, ok := strings.Cut(line, ":")
		if ok {
			headersBuf[strings.ToLower(strings.TrimSpace(k))] = strings.TrimSpace(v)
		}
	}
	cl := 0
	if s := headersBuf["content-length"]; s != "" {
		cl, _ = strconv.Atoi(s)
	}
	body := ""
	if cl > 0 && cl < 1<<20 {
		buf := make([]byte, cl)
		if _, err := io.ReadFull(reader, buf); err == nil {
			body = string(buf)
		}
	}
	return code, body, nil
}

func parseStatus(line string) int {
	parts := strings.Fields(line)
	if len(parts) < 2 {
		return 0
	}
	n, _ := strconv.Atoi(parts[1])
	return n
}

func guessBrand(path, sdp string) string {
	p := strings.ToLower(path + " " + sdp)
	switch {
	case strings.Contains(p, "streaming/channels"):
		return "hikvision"
	case strings.Contains(p, "realmonitor"):
		return "dahua"
	case strings.Contains(p, "tapo") || strings.Contains(path, "/stream1"):
		return "tapo"
	case strings.Contains(p, "ezviz") || strings.Contains(p, "/h264/ch"):
		return "ezviz"
	default:
		return "generic"
	}
}

func hasVideoSDP(sdp string) bool {
	return strings.Contains(sdp, "m=video")
}

func buildURL(user, pass, host string, port int, path string) string {
	u := &url.URL{
		Scheme: "rtsp",
		Host:   net.JoinHostPort(host, strconv.Itoa(port)),
		Path:   path,
	}
	if strings.Contains(path, "?") {
		base, q, _ := strings.Cut(path, "?")
		u.Path = base
		u.RawQuery = q
	}
	if user != "" || pass != "" {
		u.User = url.UserPassword(user, pass)
	}
	return u.String()
}

type cred struct{ user, pass string }

// VerifyStream tries RTSP DESCRIBE until a video track is returned.
// Ping/open-port alone is never enough — 200 + m=video required.
func VerifyStream(host string, port int) *ProbeResult {
	deadline := 8 * time.Second
	addr := net.JoinHostPort(host, strconv.Itoa(port))

	creds := []cred{
		{"", ""},
		{"admin", ""},
		{"admin", "admin"},
		{"admin", "12345"},
	}

	for i, path := range DefaultPaths {
		for j, c := range creds {
			// Anonymous first path only for most creds to keep runtime bounded.
			if c.user != "" && i > 4 {
				continue
			}
			_ = j
			conn, err := net.DialTimeout("tcp", addr, 400*time.Millisecond)
			if err != nil {
				return nil
			}
			_ = conn.SetDeadline(time.Now().Add(deadline))
			rtspURL := buildURL(c.user, c.pass, host, port, path)
			headers := map[string]string{"Accept": "application/sdp"}
			if c.user != "" {
				// Basic is often ignored; cameras accept userinfo in URL.
			}
			code, body, err := request(conn, "DESCRIBE", rtspURL, headers)
			_ = conn.Close()
			if err != nil {
				continue
			}
			if code == 200 && hasVideoSDP(body) {
				return &ProbeResult{
					URL:      rtspURL,
					Path:     path,
					Brand:    guessBrand(path, body),
					HasVideo: true,
				}
			}
			if code == 401 || code == 403 {
				continue
			}
		}
	}
	return nil
}
