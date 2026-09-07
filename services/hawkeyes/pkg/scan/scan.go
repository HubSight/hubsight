package scan

import (
	"context"
	"net"
	"sort"
	"sync"
	"sync/atomic"

	"cctv/hawkeyes/pkg/netinfo"
	"cctv/hawkeyes/pkg/onvif"
	"cctv/hawkeyes/pkg/rtsp"
)

type Candidate struct {
	IP      string `json:"ip"`
	Port    int    `json:"port"`
	Iface   string `json:"iface"`
	Via     string `json:"via"`
	Brand   string `json:"brand"`
	RtspURL string `json:"rtsp_url"`
	Path    string `json:"path"`
}

type ProgressFn func(scanned, total int, iface string, found *Candidate)

type Request struct {
	ExtraCIDRs   []string
	ExcludeHosts map[string]bool
}

func Run(ctx context.Context, req Request, onProgress ProgressFn) ([]Candidate, []netinfo.Subnet, error) {
	subnets, err := netinfo.ListIPv4Subnets(req.ExtraCIDRs)
	if err != nil {
		return nil, nil, err
	}

	skip := map[string]bool{}
	for k, v := range req.ExcludeHosts {
		if v {
			skip[k] = true
		}
	}
	for _, s := range subnets {
		if s.IP != "" {
			skip[s.IP] = true
		}
	}

	hintIPs := onvif.Probe(0)
	priority := map[string]string{} // ip -> iface hint
	for _, ip := range hintIPs {
		if skip[ip] {
			continue
		}
		priority[ip] = ifaceForIP(ip, subnets)
	}

	type host struct {
		ip, iface string
	}
	seenHost := map[string]bool{}
	var hosts []host
	for ip, iface := range priority {
		seenHost[ip] = true
		hosts = append(hosts, host{ip, iface})
	}
	for _, sn := range subnets {
		for _, ip := range netinfo.HostsInCIDR(sn.CIDR, skip) {
			if seenHost[ip] {
				continue
			}
			seenHost[ip] = true
			hosts = append(hosts, host{ip, sn.Iface})
		}
	}

	total := int64(len(hosts))
	var scanned int64
	var mu sync.Mutex
	found := make([]Candidate, 0)
	foundIP := map[string]bool{}

	sem := make(chan struct{}, 48)
	var wg sync.WaitGroup

	emitProgress := func(iface string, c *Candidate) {
		if onProgress != nil {
			onProgress(int(atomic.LoadInt64(&scanned)), int(total), iface, c)
		}
	}

	for _, h := range hosts {
		if ctx.Err() != nil {
			break
		}
		h := h
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			if ctx.Err() != nil {
				atomic.AddInt64(&scanned, 1)
				return
			}
			c := probeHost(h.ip, h.iface)
			atomic.AddInt64(&scanned, 1)
			if c != nil {
				mu.Lock()
				if !foundIP[c.IP] {
					foundIP[c.IP] = true
					found = append(found, *c)
					mu.Unlock()
					emitProgress(h.iface, c)
					return
				}
				mu.Unlock()
			}
			emitProgress(h.iface, nil)
		}()
	}
	wg.Wait()

	sort.Slice(found, func(i, j int) bool { return found[i].IP < found[j].IP })
	return found, subnets, nil
}

func ifaceForIP(ip string, subnets []netinfo.Subnet) string {
	addr := net.ParseIP(ip)
	if addr == nil {
		return "unknown"
	}
	for _, sn := range subnets {
		_, n, err := net.ParseCIDR(sn.CIDR)
		if err != nil || n == nil {
			continue
		}
		if n.Contains(addr) {
			return sn.Iface
		}
	}
	return "unknown"
}

func probeHost(ip, iface string) *Candidate {
	ports := []int{554, 8554}
	for _, port := range ports {
		if !rtsp.PortOpen(ip, port) {
			continue
		}
		res := rtsp.VerifyStream(ip, port)
		if res == nil || !res.HasVideo {
			continue
		}
		return &Candidate{
			IP:      ip,
			Port:    port,
			Iface:   iface,
			Via:     iface,
			Brand:   res.Brand,
			RtspURL: res.URL,
			Path:    res.Path,
		}
	}
	return nil
}
