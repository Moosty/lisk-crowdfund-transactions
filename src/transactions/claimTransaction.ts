import {intToBuffer, stringToBuffer} from '@liskhq/lisk-cryptography';
import {validator} from '@liskhq/lisk-validator';
import {
  BaseTransaction,
  constants,
  convertToAssetError,
  StateStore,
  StateStorePrepare,
  TransactionError,
} from '@liskhq/lisk-transactions';

import {ClaimAsset} from '../schemas';
import {CrowdfundAccount, ClaimTx, ClaimTxAsset, Payment} from '../types';
import {
  ACTIVE_STATUS,
  CLAIM_TYPE,
  PERIOD,
  ENDED_STATUS,
  REFUND_STATUS
} from "../constants";

export class ClaimTransaction extends BaseTransaction {
  readonly asset: ClaimTxAsset;
  public static TYPE = CLAIM_TYPE;

  public constructor(rawTransaction: unknown) {
    super(rawTransaction);
    const tx = (typeof rawTransaction === 'object' && rawTransaction !== null
      ? rawTransaction
      : {}) as Partial<ClaimTx>;

    if (tx.asset) {
      this.asset = {
        fundraiser: tx.asset.fundraiser,
        amount: tx.asset.amount,
        message: tx.asset.message ? tx.asset.message : "",
      } as ClaimTxAsset;
    } else {
      this.asset = {} as ClaimTxAsset;
    }
  }

  protected validateAsset(): ReadonlyArray<TransactionError> {
    const asset = this.assetToJSON() as ClaimTxAsset;
    const schemaErrors = validator.validate(ClaimAsset, asset);
    return convertToAssetError(
      this.id,
      schemaErrors,
    ) as TransactionError[];
  }

  protected assetToBytes(): Buffer {
    const amountBuffer = intToBuffer(
      this.asset.amount.toString(),
      constants.BYTESIZES.AMOUNT,
      'big',
    );
    const fundraiserBuffer = this.asset.fundraiser
      ? stringToBuffer(this.asset.fundraiser)
      : Buffer.alloc(0);
    const messageBuffer = this.asset.message
      ? stringToBuffer(this.asset.message)
      : Buffer.alloc(0);

    return Buffer.concat([
      fundraiserBuffer,
      amountBuffer,
      messageBuffer,
    ]);
  }

  public async prepare(store: StateStorePrepare): Promise<void> {
    await store.account.cache([
      {
        address: this.senderId,
      },
      {
        address: this.asset.fundraiser,
      },
    ]);
  }

  public calculateCurrentPeriod(currentTime: number, startTime: number): number {
    return Math.ceil((currentTime - startTime) / PERIOD);
  }

  public allowedToClaim(currentTime: number, startTime: number, payments: Array<Payment>): boolean {
    const currentPeriod = this.calculateCurrentPeriod(currentTime, startTime);
    if (payments.find(p =>
      p.type === 0 &&
        p.period === this.asset.period)) {
      return false;
    }
    return (currentPeriod * PERIOD) + startTime < currentTime;
  }

  public amountToClaim(goal: bigint, periods: number): bigint {
    return goal / BigInt(periods);
  }

  protected async applyAsset(store: StateStore): Promise<ReadonlyArray<TransactionError>> {
    const errors: TransactionError[] = [];
    const fundraiser = await store.account.getOrDefault(this.asset.fundraiser) as CrowdfundAccount;
    const sender = await store.account.get(this.senderId);
    const amountToClaim = this.amountToClaim(BigInt(fundraiser.asset.goal), fundraiser.asset.periods);
    if (BigInt(this.asset.amount) !== amountToClaim) {
      errors.push(
        new TransactionError(
          'Amount to claim is incorrect',
          this.id,
          '.asset.amount',
          this.asset.amount,
          amountToClaim.toString(),
        )
      );
    }
    sender.balance += amountToClaim;
    store.account.set(sender.address, sender);

    const allowedToClaim = this.allowedToClaim(store.chain.lastBlockHeader.timestamp, fundraiser.asset.startProject, fundraiser.asset.payments);

    if (!allowedToClaim) {
      errors.push(
        new TransactionError(
          'You are not allowed to claim anything at this moment',
          this.id,
          '.asset.fundraiser',
          this.asset.fundraiser,
        )
      );
    }

    if (this.senderPublicKey !== fundraiser.asset.owner) {
      errors.push(
        new TransactionError(
          'You are not the owner of this fundraiser',
          this.id,
          '.senderPublicKey',
          this.senderPublicKey,
          fundraiser.asset.owner,
        )
      );
    }

    if (fundraiser.asset.status === REFUND_STATUS) {
      errors.push(
        new TransactionError(
          'Stakeholders voted not to support this project anymore',
          this.id,
          '.asset.status',
          fundraiser.asset.status,
          ACTIVE_STATUS,
        )
      );
    }

    const payment: Payment = {
      transaction: this.id,
      period: this.asset.period,
      recipient: this.senderId,
      amount: amountToClaim.toString(),
      type: 0,
    };

    fundraiser.balance -= amountToClaim;
    fundraiser.asset = {
      ...fundraiser.asset,
      payments: [
        ...fundraiser.asset.payments,
        payment,
      ],
      status: this.asset.period === fundraiser.asset.periods ? ENDED_STATUS : ACTIVE_STATUS,
    };

    store.account.set(fundraiser.address, fundraiser);
    return errors;
  }

  protected async undoAsset(store: StateStore): Promise<ReadonlyArray<TransactionError>> {
    const errors: TransactionError[] = [];
    const sender = await store.account.get(this.senderId);
    sender.balance -= BigInt(this.asset.amount);
    store.account.set(sender.address, sender);

    const fundraiser = await store.account.get(this.asset.fundraiser) as CrowdfundAccount;
    const payments = fundraiser.asset.payments
      .filter((payment) => payment.transaction !== this.id);

    fundraiser.balance += BigInt(this.asset.amount);
    fundraiser.asset = {
      ...fundraiser.asset,
      payments,
      status: ACTIVE_STATUS,
    };

    store.account.set(fundraiser.address, fundraiser);
    return errors;
  }
}
