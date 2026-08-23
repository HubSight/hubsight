#!/bin/bash
cd /Users/anhquoctran/Workspace/cctv
protoc --go_out=services/shared/pkg/pb --go_opt=paths=source_relative \
       --go-grpc_out=services/shared/pkg/pb --go-grpc_opt=paths=source_relative \
       -I=services/shared/proto services/shared/proto/*.proto
ls -l services/shared/pkg/pb
