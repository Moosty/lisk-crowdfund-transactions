import {getAddressFromPublicKey, intToBuffer, stringToBuffer} from '@liskhq/lisk-cryptography';
import {validator} from '@liskhq/lisk-validator';
import {
  BaseTransaction,
  constants,
  convertToAssetError,
  StateStore,
  StateStorePrepare,
  TransactionError,
} from '@liskhq/lisk-transactions';

import {RefundAsset} from '../schemas';
import {CrowdfundAccount, Investment, Payment, RefundTx, RefundTxAsset} from '../types';
import {FUND_TIME, REFUND_STATUS, REFUND_TYPE} from "../constants";

export class RefundTransaction extends BaseTransaction {
  readonly asset: RefundTxAsset;
  public static TYPE = REFUND_TYPE;

  public constructor(rawTransaction: unknown) {
    super(rawTransaction);
    const tx = (typeof rawTransaction === 'object' && rawTransaction !== null
      ? rawTransaction
      : {}) as Partial<RefundTx>;

    if (tx.asset) {
      this.asset = {
        fundraiser: tx.asset.fundraiser,
        amount: tx.asset.amount,
      } as RefundTxAsset;
    } else {
      this.asset = {} as RefundTxAsset;
    }
  }

  protected validateAsset(): ReadonlyArray<TransactionError> {
    const asset = this.assetToJSON() as RefundTxAsset;
    const schemaErrors = validator.validate(RefundAsset, asset);
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

    return Buffer.concat([
      fundraiserBuffer,
      amountBuffer,
    ]);
  }

  public async prepare(store: StateStorePrepare): Promise<void> {
    await store.account.cache([
      {
        address: this.senderId,
      },
      {
        address: getAddressFromPublicKey(this.asset.fundraiser),
      },
    ]);
  }

  public calculateVoteStake(investments: Array<Investment>): bigint {
    let voteStake = BigInt(0);
    investments.map(investment => {
      if (investment.address === this.senderId) {
        voteStake += BigInt(investment.amount);
      }
    });
    const totalInvestments = this.calculateFundsRaised(investments);
    return totalInvestments ? voteStake / totalInvestments : BigInt(0);
  }

  public allowedToRefund(fundraiser: CrowdfundAccount): bigint {
    const payedFilterd = fundraiser.asset.payments
      .filter(p => p.type === 0)
      .map(p => BigInt(p.amount));
    const payedSender = fundraiser.asset.payments
      .filter(p => p.type === 1 && p.recipient === this.senderId)
      .map(p => BigInt(p.amount));
    const payedSenderAmount = payedSender.length > 0 ? payedSender.reduce((accumulator, currentValue) => accumulator + currentValue) : BigInt(0);
    const payedAmount = payedFilterd.length > 0 ? payedFilterd.reduce((accumulator, currentValue) => accumulator + currentValue) : BigInt(0);
    const amountLeft = this.calculateFundsRaised(fundraiser.asset.investments) - payedAmount;
    return (amountLeft * this.calculateVoteStake(fundraiser.asset.investments)) - payedSenderAmount;
  }

  public calculateFundsRaised(investments: Array<Investment>): bigint {
    let fundsRaised = BigInt(0);
    investments.map(investment => {
      fundsRaised += BigInt(investment.amount);
    });

    return fundsRaised;
  }

  protected async applyAsset(store: StateStore): Promise<ReadonlyArray<TransactionError>> {
    const errors: TransactionError[] = [];
    const fundraiser = await store.account.getOrDefault(getAddressFromPublicKey(this.asset.fundraiser)) as CrowdfundAccount;
    const sender = await store.account.get(this.senderId);
    const allowedToRefund = this.allowedToRefund(fundraiser);
    const fundsRaised = this.calculateFundsRaised(fundraiser.asset.investments);

    if (allowedToRefund === BigInt(0) || allowedToRefund !== BigInt(this.asset.amount)) {
      errors.push(
        new TransactionError(
          'Amount to claim is incorrect',
          this.id,
          '.asset.amount',
          this.asset.amount,
          allowedToRefund.toString(),
        )
      );
    }
    sender.balance += allowedToRefund;
    store.account.set(sender.address, sender);

    if (!fundraiser.asset.investments.find(i => i.address === this.senderId)) {
      errors.push(
        new TransactionError(
          'You are not a donor of this fundraiser',
          this.id,
          '.senderId',
          this.senderId,
        )
      );
    }

    if (fundsRaised === BigInt(fundraiser.asset.goal) && fundraiser.asset.status !== REFUND_STATUS) {
      errors.push(
        new TransactionError(
          'Fundraiser is not in refund state',
          this.id,
          '.asset.status',
          REFUND_STATUS,
          fundraiser.asset.status,
        )
      );
    }

    if (fundsRaised < BigInt(fundraiser.asset.goal) && fundraiser.asset.startFunding + FUND_TIME < store.chain.lastBlockHeader.timestamp) {
      errors.push(
        new TransactionError(
          'Fundraiser is not finished yet',
          this.id,
        )
      );
    }

    const payment: Payment = {
      transaction: this.id,
      period: -1,
      recipient: this.senderId,
      amount: allowedToRefund.toString(),
      type: 1, // refund
    };

    fundraiser.balance -= allowedToRefund;
    fundraiser.asset = {
      ...fundraiser.asset,
      payments: [
        ...fundraiser.asset.payments,
        payment,
      ],
      status: REFUND_STATUS,
    };

    store.account.set(fundraiser.address, fundraiser);
    return errors;
  }

  protected async undoAsset(store: StateStore): Promise<ReadonlyArray<TransactionError>> {
    const errors: TransactionError[] = [];
    const sender = await store.account.get(this.senderId);
    sender.balance -= BigInt(this.asset.amount);
    store.account.set(sender.address, sender);

    const fundraiser = await store.account.get(getAddressFromPublicKey(this.asset.fundraiser)) as CrowdfundAccount;
    const payments = fundraiser.asset.payments
      .filter((payment) => payment.transaction !== this.id);

    fundraiser.balance += BigInt(this.asset.amount);
    fundraiser.asset = {
      ...fundraiser.asset,
      payments,
    };

    store.account.set(fundraiser.address, fundraiser);
    return errors;
  }
}
