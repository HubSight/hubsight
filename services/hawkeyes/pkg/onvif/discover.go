package onvif

import (
	"net"
	"regexp"
	"strings"
	"time"
)

const probeXML = `<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
 xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
 xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
 xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
<e:Header>
<w:MessageID>uuid:hubsight-hawkeyes-probe</w:MessageID>
<w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
<w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
</e:Header>
<e:Body>
<d:Probe>
<d:Types>dn:NetworkVideoTransmitter</d:Types>
</d:Probe>
</e:Body>
</e:Envelope>`

var ipv4Re = regexp.MustCompile(`\b(\d{1,3}(?:\.\d{1,3}){3})\b`)

// Probe returns IPv4 addresses that answered ONVIF WS-Discovery. Hints only — RTSP still required.
func Probe(timeout time.Duration) []string {
	if timeout <= 0 {
		timeout = 1500 * time.Millisecond
	}
	dst, err := net.ResolveUDPAddr("udp4", "239.255.255.250:3702")
	if err != nil {
		return nil
	}
	conn, err := net.ListenPacket("udp4", ":0")
	if err != nil {
		return nil
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(timeout))
	if _, err := conn.WriteTo([]byte(probeXML), dst); err != nil {
		return nil
	}
	found := map[string]bool{}
	buf := make([]byte, 8192)
	for {
		n, _, err := conn.ReadFrom(buf)
		if err != nil {
			break
		}
		body := string(buf[:n])
		if !strings.Contains(strings.ToLower(body), "onvif") && !strings.Contains(body, "XAddrs") {
			continue
		}
		for _, m := range ipv4Re.FindAllString(body, -1) {
			ip := net.ParseIP(m)
			if ip == nil || ip.To4() == nil || ip.IsLoopback() {
				continue
			}
			found[m] = true
		}
	}
	out := make([]string, 0, len(found))
	for ip := range found {
		out = append(out, ip)
	}
	return out
}
