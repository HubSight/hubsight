package live

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/bluenviron/gohlslib/v2"
	"github.com/bluenviron/gohlslib/v2/pkg/codecs"
	"github.com/bluenviron/gortsplib/v5"
	"github.com/bluenviron/gortsplib/v5/pkg/base"
	"github.com/bluenviron/gortsplib/v5/pkg/description"
	"github.com/bluenviron/gortsplib/v5/pkg/format"
	"github.com/pion/rtp"
)

// StartSession initiates a pure Go RTSP stream ingest and remuxes it into low-latency HLS
func StartSession(ctx context.Context, cameraID int, rtspURL, transport string) (*Session, error) {
	u, err := base.ParseURL(rtspURL)
	if err != nil {
		return nil, fmt.Errorf("invalid RTSP URL: %w", err)
	}

	protocolMode := gortsplib.ProtocolTCP
	if transport == "udp" {
		protocolMode = gortsplib.ProtocolUDP
	}

	client := &gortsplib.Client{
		Scheme:   u.Scheme,
		Host:     u.Host,
		Protocol: &protocolMode,
	}

	if err := client.Start(); err != nil {
		return nil, fmt.Errorf("failed to connect to RTSP server: %w", err)
	}

	desc, _, err := client.Describe(u)
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to describe RTSP stream: %w", err)
	}

	var tracks []*gohlslib.Track
	type streamBinding struct {
		media *description.Media
		forma format.Format
		track *gohlslib.Track
	}
	var bindings []streamBinding

	// 1. Check for H264 video
	var formaH264 *format.H264
	if medi := desc.FindFormat(&formaH264); medi != nil {
		track := &gohlslib.Track{
			Codec: &codecs.H264{
				SPS: formaH264.SPS,
				PPS: formaH264.PPS,
			},
		}
		tracks = append(tracks, track)
		bindings = append(bindings, streamBinding{
			media: medi,
			forma: formaH264,
			track: track,
		})
	}

	// 2. Check for H265 video
	var formaH265 *format.H265
	if medi := desc.FindFormat(&formaH265); medi != nil {
		track := &gohlslib.Track{
			Codec: &codecs.H265{
				VPS: formaH265.VPS,
				SPS: formaH265.SPS,
				PPS: formaH265.PPS,
			},
		}
		tracks = append(tracks, track)
		bindings = append(bindings, streamBinding{
			media: medi,
			forma: formaH265,
			track: track,
		})
	}

	// 3. Check for AAC audio
	var formaAAC *format.MPEG4Audio
	if medi := desc.FindFormat(&formaAAC); medi != nil && formaAAC.Config != nil {
		track := &gohlslib.Track{
			Codec: &codecs.MPEG4Audio{
				Config: *formaAAC.Config,
			},
		}
		tracks = append(tracks, track)
		bindings = append(bindings, streamBinding{
			media: medi,
			forma: formaAAC,
			track: track,
		})
	}

	// 4. Check for Opus audio
	var formaOpus *format.Opus
	if medi := desc.FindFormat(&formaOpus); medi != nil {
		track := &gohlslib.Track{
			Codec: &codecs.Opus{
				ChannelCount: formaOpus.ChannelCount,
			},
		}
		tracks = append(tracks, track)
		bindings = append(bindings, streamBinding{
			media: medi,
			forma: formaOpus,
			track: track,
		})
	}

	if len(tracks) == 0 {
		client.Close()
		return nil, fmt.Errorf("no supported video/audio codecs found in RTSP stream")
	}

	muxer := &gohlslib.Muxer{
		Variant:            gohlslib.MuxerVariantLowLatency,
		SegmentCount:       7,
		SegmentMinDuration: 1 * time.Second,
		PartMinDuration:    200 * time.Millisecond,
		Tracks:             tracks,
	}

	if err := muxer.Start(); err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to start HLS muxer: %w", err)
	}

	sessionCtx, sessionCancel := context.WithCancel(ctx)
	readyChan := make(chan struct{})
	var onceReady sync.Once

	session := &Session{
		CameraID:     cameraID,
		Host:         rtspURL,
		Transport:    transport,
		Muxer:        muxer,
		RTSPClient:   client,
		LastAccessed: time.Now(),
		Cancel:       sessionCancel,
		ReadyChan:    readyChan,
		IsReady:      false,
	}

	// Setup tracks with RTSP client
	for _, b := range bindings {
		bMedia := b.media
		bForma := b.forma
		bTrack := b.track

		_, err := client.Setup(desc.BaseURL, bMedia, 0, 0)
		if err != nil {
			log.Printf("[Cam %d] RTSP track setup warning: %v", cameraID, err)
			continue
		}

		switch bForma.(type) {
		case *format.H264:
			forma := bForma.(*format.H264)
			rtpDec, err := forma.CreateDecoder()
			if err != nil {
				continue
			}
			client.OnPacketRTP(bMedia, bForma, func(pkt *rtp.Packet) {
				au, err := rtpDec.Decode(pkt)
				if err != nil {
					return
				}
				pts, ok := client.PacketPTS(bMedia, pkt)
				if !ok {
					return
				}
				if err := muxer.WriteH264(bTrack, time.Now(), pts, au); err == nil {
					onceReady.Do(func() {
						session.IsReady = true
						close(readyChan)
					})
				}
			})

		case *format.H265:
			forma := bForma.(*format.H265)
			rtpDec, err := forma.CreateDecoder()
			if err != nil {
				continue
			}
			client.OnPacketRTP(bMedia, bForma, func(pkt *rtp.Packet) {
				au, err := rtpDec.Decode(pkt)
				if err != nil {
					return
				}
				pts, ok := client.PacketPTS(bMedia, pkt)
				if !ok {
					return
				}
				if err := muxer.WriteH265(bTrack, time.Now(), pts, au); err == nil {
					onceReady.Do(func() {
						session.IsReady = true
						close(readyChan)
					})
				}
			})

		case *format.MPEG4Audio:
			forma := bForma.(*format.MPEG4Audio)
			rtpDec, err := forma.CreateDecoder()
			if err != nil {
				continue
			}
			client.OnPacketRTP(bMedia, bForma, func(pkt *rtp.Packet) {
				aus, err := rtpDec.Decode(pkt)
				if err != nil {
					return
				}
				pts, ok := client.PacketPTS(bMedia, pkt)
				if !ok {
					return
				}
				_ = muxer.WriteMPEG4Audio(bTrack, time.Now(), pts, aus)
			})

		case *format.Opus:
			forma := bForma.(*format.Opus)
			rtpDec, err := forma.CreateDecoder()
			if err != nil {
				continue
			}
			client.OnPacketRTP(bMedia, bForma, func(pkt *rtp.Packet) {
				frame, err := rtpDec.Decode(pkt)
				if err != nil {
					return
				}
				pts, ok := client.PacketPTS(bMedia, pkt)
				if !ok {
					return
				}
				_ = muxer.WriteOpus(bTrack, time.Now(), pts, [][]byte{frame})
			})
		}
	}

	if _, err := client.Play(nil); err != nil {
		muxer.Close()
		client.Close()
		sessionCancel()
		return nil, fmt.Errorf("failed to play RTSP stream: %w", err)
	}

	// Monitor session cancellation
	go func() {
		defer muxer.Close()
		defer client.Close()

		<-sessionCtx.Done()
		log.Printf("[Live Hub] Pure Go live session for camera %d terminated.", cameraID)
	}()

	return session, nil
}
