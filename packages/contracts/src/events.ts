import type {
  AckEnvelope,
  ChatMessage,
  ChatMessageEvent,
  ChatSendRequest,
  ConnectionStateEvent,
  ContractError,
  CorrectGuessBroadcast,
  CreateRoomRequest,
  DrawingBatchRequest,
  DrawingBatchResult,
  DrawingBroadcast,
  DrawingReplayRequest,
  EmptySuccess,
  GuessFeedback,
  GuessFeedbackEvent,
  GuessSubmitRequest,
  HostTransferredEvent,
  JoinRoomRequest,
  KickedEvent,
  KickPlayerRequest,
  LeaveRoomRequest,
  PlayerEvent,
  PlayerLeftEvent,
  PlayerRoomSnapshot,
  ReplayState,
  ResumeSessionRequest,
  RoomMutationResult,
  RoundEvent,
  RoundPrivateEvent,
  ScoreUpdatedEvent,
  ServerShutdownEvent,
  SelectWordRequest,
  SessionEstablished,
  SettingsUpdatedEvent,
  SnapshotRequest,
  StartMatchRequest,
  DrawingResetEvent,
  MatchFinishedEvent,
  SnapshotRequiredEvent,
  TurnEndedEvent,
  UpdateProfileRequest,
  UpdateSettingsRequest,
} from "./schemas.js";

export type AckCallback<T> = (response: AckEnvelope<T>) => void;

/**
 * Socket.IO events emitted by a browser. Every mutating payload contains a
 * `mutation.idempotencyId`; read-only recovery requests are the only
 * exceptions.
 */
export interface ClientToServerEvents {
  "session:resume": (
    request: ResumeSessionRequest,
    ack: AckCallback<SessionEstablished>,
  ) => void;
  "room:create": (
    request: CreateRoomRequest,
    ack: AckCallback<SessionEstablished>,
  ) => void;
  "room:join": (
    request: JoinRoomRequest,
    ack: AckCallback<SessionEstablished>,
  ) => void;
  "room:leave": (
    request: LeaveRoomRequest,
    ack: AckCallback<EmptySuccess>,
  ) => void;
  "room:profile:update": (
    request: UpdateProfileRequest,
    ack: AckCallback<RoomMutationResult>,
  ) => void;
  "room:settings:update": (
    request: UpdateSettingsRequest,
    ack: AckCallback<RoomMutationResult>,
  ) => void;
  "room:kick": (
    request: KickPlayerRequest,
    ack: AckCallback<RoomMutationResult>,
  ) => void;
  "match:start": (
    request: StartMatchRequest,
    ack: AckCallback<RoomMutationResult>,
  ) => void;
  "round:select-word": (
    request: SelectWordRequest,
    ack: AckCallback<RoomMutationResult>,
  ) => void;
  "drawing:batch": (
    request: DrawingBatchRequest,
    ack: AckCallback<DrawingBatchResult>,
  ) => void;
  "drawing:replay": (
    request: DrawingReplayRequest,
    ack: AckCallback<ReplayState>,
  ) => void;
  "chat:send": (
    request: ChatSendRequest,
    ack: AckCallback<ChatMessage>,
  ) => void;
  "guess:submit": (
    request: GuessSubmitRequest,
    ack: AckCallback<GuessFeedback>,
  ) => void;
  "snapshot:request": (
    request: SnapshotRequest,
    ack: AckCallback<PlayerRoomSnapshot>,
  ) => void;
}

export interface ServerToClientEvents {
  "connection:state": (event: ConnectionStateEvent) => void;
  "room:snapshot": (snapshot: PlayerRoomSnapshot) => void;
  "room:error": (error: ContractError) => void;
  "room:player-joined": (event: PlayerEvent) => void;
  "room:player-updated": (event: PlayerEvent) => void;
  "room:player-left": (event: PlayerLeftEvent) => void;
  "room:host-transferred": (event: HostTransferredEvent) => void;
  "room:settings-updated": (event: SettingsUpdatedEvent) => void;
  "room:kicked": (event: KickedEvent) => void;
  "round:selection-started": (event: RoundEvent) => void;
  "round:private": (event: RoundPrivateEvent) => void;
  "round:started": (event: RoundEvent) => void;
  "round:paused": (event: RoundEvent) => void;
  "round:resumed": (event: RoundEvent) => void;
  "round:ended": (event: TurnEndedEvent) => void;
  "match:finished": (event: MatchFinishedEvent) => void;
  "drawing:batch": (event: DrawingBroadcast) => void;
  "drawing:reset": (event: DrawingResetEvent) => void;
  "drawing:replay": (event: ReplayState) => void;
  "chat:message": (event: ChatMessageEvent) => void;
  "guess:feedback": (event: GuessFeedbackEvent) => void;
  "guess:correct": (event: CorrectGuessBroadcast) => void;
  "score:updated": (event: ScoreUpdatedEvent) => void;
  "snapshot:required": (event: SnapshotRequiredEvent) => void;
  "server:shutdown": (event: ServerShutdownEvent) => void;
}

export interface InterServerEvents {
  "room:invalidate": (code: string, revision: number) => void;
}

export interface SocketData {
  playerId?: string;
  roomCode?: string;
  reconnectTokenHash?: string;
}
