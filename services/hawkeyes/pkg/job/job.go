package job

import (
	"context"
	"sync"
	"time"

	"cctv/hawkeyes/pkg/nanoid"
	"cctv/hawkeyes/pkg/netinfo"
	"cctv/hawkeyes/pkg/scan"
)

type Status string

const (
	StatusRunning  Status = "running"
	StatusDone     Status = "done"
	StatusCanceled Status = "canceled"
	StatusFailed   Status = "failed"
)

type Job struct {
	ID         string           `json:"id"`
	Status     Status           `json:"status"`
	Scanned    int              `json:"scanned"`
	Total      int              `json:"total"`
	Iface      string           `json:"iface"`
	Subnets    []netinfo.Subnet `json:"subnets"`
	Candidates []scan.Candidate `json:"candidates"`
	Error      string           `json:"error,omitempty"`
	StartedAt  time.Time        `json:"started_at"`
	FinishedAt *time.Time       `json:"finished_at,omitempty"`

	cancel context.CancelFunc
	mu     sync.Mutex
}

type JobSnapshot struct {
	ID         string           `json:"id"`
	Status     Status           `json:"status"`
	Scanned    int              `json:"scanned"`
	Total      int              `json:"total"`
	Iface      string           `json:"iface"`
	Subnets    []netinfo.Subnet `json:"subnets"`
	Candidates []scan.Candidate `json:"candidates"`
	Error      string           `json:"error,omitempty"`
	StartedAt  time.Time        `json:"started_at"`
	FinishedAt *time.Time       `json:"finished_at,omitempty"`
}

func (j *Job) snapshot() JobSnapshot {
	j.mu.Lock()
	defer j.mu.Unlock()
	return JobSnapshot{
		ID:         j.ID,
		Status:     j.Status,
		Scanned:    j.Scanned,
		Total:      j.Total,
		Iface:      j.Iface,
		Subnets:    append([]netinfo.Subnet(nil), j.Subnets...),
		Candidates: append([]scan.Candidate(nil), j.Candidates...),
		Error:      j.Error,
		StartedAt:  j.StartedAt,
		FinishedAt: j.FinishedAt,
	}
}

type Manager struct {
	mu   sync.Mutex
	jobs map[string]*Job
}

func NewManager() *Manager {
	return &Manager{jobs: map[string]*Job{}}
}

func (m *Manager) Start(extraCIDRs []string, exclude map[string]bool) *Job {
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	j := &Job{
		ID:         nanoid.New(),
		Status:     StatusRunning,
		Candidates: []scan.Candidate{},
		StartedAt:  time.Now(),
		cancel:     cancel,
	}
	m.mu.Lock()
	m.jobs[j.ID] = j
	m.mu.Unlock()

	go func() {
		found, subnets, err := scan.Run(ctx, scan.Request{ExtraCIDRs: extraCIDRs, ExcludeHosts: exclude},
			func(scanned, total int, iface string, c *scan.Candidate) {
				j.mu.Lock()
				j.Scanned = scanned
				j.Total = total
				j.Iface = iface
				if c != nil {
					j.Candidates = append(j.Candidates, *c)
				}
				j.mu.Unlock()
			})
		now := time.Now()
		j.mu.Lock()
		j.FinishedAt = &now
		j.Subnets = subnets
		if ctx.Err() == context.Canceled {
			j.Status = StatusCanceled
		} else if err != nil {
			j.Status = StatusFailed
			j.Error = err.Error()
		} else {
			j.Status = StatusDone
			j.Candidates = found
			j.Scanned = j.Total
		}
		j.mu.Unlock()
	}()
	return j
}

func (m *Manager) Get(id string) *Job {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.jobs[id]
}

func (m *Manager) Snapshot(id string) (JobSnapshot, bool) {
	j := m.Get(id)
	if j == nil {
		return JobSnapshot{}, false
	}
	return j.snapshot(), true
}

func (m *Manager) Cancel(id string) bool {
	j := m.Get(id)
	if j == nil {
		return false
	}
	j.cancel()
	return true
}
