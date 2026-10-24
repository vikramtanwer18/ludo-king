import type { GameSlug } from "./config";

export type Tone = "red" | "green" | "yellow" | "blue";

export interface User {
  id: string;
  name: string;
  email: string; // only filled in for the signed-in player
  tone: Tone;
  inviteCode: string;
  invitedBy?: string; // user id
  createdAt: number;
  isSeed?: boolean;
}

export type MatchStatus =
  | "open" // waiting for someone to join
  | "requested" // someone asked to join, creator decides
  | "running" // accepted; room code + play + results
  | "completed"
  | "cancelled"
  | "disputed";

export type Outcome = "won" | "lost" | "cancel";

export interface ResultEntry {
  outcome: Outcome;
  reason?: string;
  screenshot?: string; // small data URL
  at: number;
}

export interface Match {
  id: string;
  game: GameSlug;
  note?: string;
  createdBy: string;
  joinedBy?: string;
  status: MatchStatus;
  roomCode?: string;
  roomCodeDeadline?: number;
  startedAt?: number;
  firstResultAt?: number;
  results: Record<string, ResultEntry>;
  winnerId?: string;
  endedReason?: string;
  /** Stake per player in paise. 0 = old free room. */
  amount: number;
  /** Commission % fixed when the room was created. */
  feePct: number;
  /** Paid to the winner (paise), set when the match completes. */
  prize?: number;
  fee?: number;
  createdAt: number;
  updatedAt: number;
}

export type KycStatus = "pending" | "approved" | "rejected";

export interface WalletSummary {
  balance: number; // paise
  kyc: KycStatus | null;
}

export type DepositStatus = "pending" | "success" | "failed" | "expired";
export type WithdrawalStatus = "pending" | "approved" | "paid" | "declined" | "cancelled";

export interface Deposit {
  id: string;
  amount: number;
  paidAmount?: number;
  status: DepositStatus;
  qrImage?: string;
  closeBy?: number;
  paymentId?: string;
  method?: string;
  failureReason?: string;
  demo: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Withdrawal {
  id: string;
  amount: number;
  method: "bank" | "upi";
  destination: string; // masked, for display
  status: WithdrawalStatus;
  adminNote?: string;
  utr?: string;
  createdAt: number;
  updatedAt: number;
}

export interface WalletTxn {
  id: string;
  kind: string;
  amount: number;
  balanceAfter: number;
  ref?: string;
  note?: string;
  at: number;
}

export interface Kyc {
  fullName: string;
  pan: string;
  bankHolder?: string;
  bankAccount?: string; // masked for the player
  bankIfsc?: string;
  upiId?: string;
  status: KycStatus;
  rejectReason?: string;
  submittedAt: number;
}

export interface Notice {
  id: string;
  userId: string;
  text: string;
  href?: string;
  at: number;
  read: boolean;
}
