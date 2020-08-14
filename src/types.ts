import {Account} from "@liskhq/lisk-transactions";

export interface CrowdfundAccount extends Account {
  asset: CrowdfundAccountAsset;
}

export interface CrowdfundAccountAsset {
  readonly owner: string;
  readonly status: string;
  readonly payments: Array<Payment>;
  readonly goal: string;
  readonly periods: number;
  readonly voteTime: number;
  readonly investments: Array<Investment>;
  readonly votes: Array<Vote>;
  readonly title: string;
  readonly description: string;
  readonly site: string;
  readonly image: string;
  readonly startFunding: number;
  readonly startProject: number;
  readonly category: string;
}

export interface Payment {
  readonly transaction: string;
  readonly period: number;
  readonly recipient: string;
  readonly amount: string;
  readonly type: number;
}

export interface Investment {
  readonly address: string;
  readonly amount: string;
  readonly timestamp: number;
  readonly message?: string;
}

export interface Vote {
  readonly address: string;
  readonly stake: number;
  readonly vote: number;
  readonly period: number;
}

export interface FundTx extends TransactionJSON {
  readonly asset: FundTxAsset;
}

export interface ClaimTx extends TransactionJSON {
  readonly asset: ClaimTxAsset;
}

export interface CommentTx extends TransactionJSON {
  readonly asset: CommentTxAsset;
}

export interface RefundTx extends TransactionJSON {
  readonly asset: RefundTxAsset;
}

export interface RegisterTx extends TransactionJSON {
  readonly asset: RegisterTxAsset;
}

export interface StartTx extends TransactionJSON {
  readonly asset: StartTxAsset;
}
export interface VoteTx extends TransactionJSON {
  readonly asset: VoteTxAsset;
}

export interface ClaimTxAsset {
  readonly fundraiser: string;
  readonly period: number;
  readonly amount: string;
  readonly message: string;
}

export interface CommentTxAsset {
  readonly fundraiser: string;
  readonly comment: string;
  readonly type: number;
}

export interface FundTxAsset {
  readonly fundraiser: string;
  readonly amount: string;
  readonly message?: string;
}

export interface RefundTxAsset {
  readonly fundraiser: string;
  readonly amount: string;
}

export interface RegisterTxAsset {
  fundraiser?: string;
  readonly goal: string; // amount to raise
  readonly voteTime: number; // every how many periods vote allowed
  readonly periods: number;
  readonly title: string;
  readonly description: string;
  readonly site: string; // url
  readonly image: string; // base64 image
  readonly category: string;
  readonly start: number;
}

export interface StartTxAsset {
  readonly fundraiser: string;
  readonly timestamp: number; // timestamp when project starts counting time
}

export interface VoteTxAsset {
  readonly fundraiser: string;
  readonly period: number;
  readonly vote: number; // 0: want refund, 1: allow claiming
}

export interface TransactionJSON {
  readonly id?: string;
  readonly blockId?: string;
  readonly height?: number;
  readonly confirmations?: number;
  readonly senderPublicKey: string;
  readonly signatures?: ReadonlyArray<string>;
  readonly type: number;
  readonly receivedAt?: string;
  readonly networkIdentifier?: string;
  readonly nonce: string;
  readonly fee: string;
}
