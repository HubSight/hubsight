package netinfo

import (
	"net"
	"os"
	"strings"
)

type Subnet struct {
	Iface string `json:"iface"`
	CIDR  string `json:"cidr"`
	IP    string `json:"ip"`
}

func skipIface(name string) bool {
	n := strings.ToLower(name)
	switch {
	case n == "lo", strings.HasPrefix(n, "lo"):
		return true
	case strings.HasPrefix(n, "veth"):
		return true // veth peers; the bridge still scanned
	default:
		return false
	}
}

func ListIPv4Subnets(extraCIDRs []string) ([]Subnet, error) {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil, err
	}
	out := make([]Subnet, 0)
	seen := map[string]bool{}

	for _, iface := range ifaces {
		if skipIface(iface.Name) {
			continue
		}
		if iface.Flags&net.FlagUp == 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, a := range addrs {
			ipnet, ok := a.(*net.IPNet)
			if !ok || ipnet.IP == nil {
				continue
			}
			ip4 := ipnet.IP.To4()
			if ip4 == nil {
				continue
			}
			if ip4.IsLoopback() || ip4.IsLinkLocalUnicast() {
				continue
			}
			ones, bits := ipnet.Mask.Size()
			if bits != 32 || ones < 16 {
				// Skip huge prefixes (and malformed). /16 is the widest allowed.
				continue
			}
			cidr := ipnet.String()
			if seen[cidr] {
				continue
			}
			seen[cidr] = true
			out = append(out, Subnet{Iface: iface.Name, CIDR: cidr, IP: ip4.String()})
		}
	}

	for _, raw := range extraCIDRs {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		_, ipnet, err := net.ParseCIDR(raw)
		if err != nil {
			ip := net.ParseIP(raw)
			if ip == nil || ip.To4() == nil {
				continue
			}
			_, ipnet, _ = net.ParseCIDR(ip.To4().String() + "/24")
		}
		if ipnet == nil {
			continue
		}
		cidr := ipnet.String()
		if seen[cidr] {
			continue
		}
		seen[cidr] = true
		out = append(out, Subnet{Iface: "extra", CIDR: cidr, IP: ""})
	}

	if env := strings.TrimSpace(os.Getenv("HAWKEYES_EXTRA_CIDRS")); env != "" {
		for _, raw := range strings.Split(env, ",") {
			raw = strings.TrimSpace(raw)
			if raw == "" {
				continue
			}
			_, ipnet, err := net.ParseCIDR(raw)
			if err != nil {
				continue
			}
			cidr := ipnet.String()
			if seen[cidr] {
				continue
			}
			seen[cidr] = true
			out = append(out, Subnet{Iface: "extra", CIDR: cidr, IP: ""})
		}
	}
	return out, nil
}

func HostsInCIDR(cidr string, skipIPs map[string]bool) []string {
	_, ipnet, err := net.ParseCIDR(cidr)
	if err != nil {
		return nil
	}
	ip := ipnet.IP.To4()
	if ip == nil {
		return nil
	}
	ones, bits := ipnet.Mask.Size()
	if bits-ones > 10 {
		// >1024 hosts: refuse (too wide)
		return nil
	}
	var hosts []string
	for ip := ip.Mask(ipnet.Mask); ipnet.Contains(ip); incIP(ip) {
		s := ip.String()
		if skipIPs[s] {
			continue
		}
		hosts = append(hosts, s)
	}
	if len(hosts) >= 2 {
		// drop network and broadcast
		hosts = hosts[1 : len(hosts)-1]
	}
	return hosts
}

func incIP(ip net.IP) {
	for j := len(ip) - 1; j >= 0; j-- {
		ip[j]++
		if ip[j] > 0 {
			break
		}
	}
}
