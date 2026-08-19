export class EmitEventDto {
  room?: string;
  socketId?: string;
  event: string;
  data: any;
}

export class BroadcastEventDto {
  event: string;
  data: any;
}

export class JoinRoomDto {
  room: string;
}

export class LeaveRoomDto {
  room: string;
}

export class RelayMessageDto {
  targetRoom?: string;
  targetSocketId?: string;
  event: string;
  payload: any;
}
