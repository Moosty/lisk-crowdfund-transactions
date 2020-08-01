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

import {FundAsset} from '../schemas';
import {CrowdfundAccount, FundTx, FundTxAsset, Investment} from '../types';
import {FUND_TYPE, FUNDED_STATUS, FUNDING_STATUS, FUND_TIME} from "../constants";

export class FundTransaction extends BaseTransaction {
  readonly asset: FundTxAsset;
  public static TYPE = FUND_TYPE;

  public constructor(rawTransaction: unknown) {
    super(rawTransaction);
    const tx = (typeof rawTransaction === 'object' && rawTransaction !== null
      ? rawTransaction
      : {}) as Partial<FundTx>;

    if (tx.asset) {
      this.asset = {
        fundraiser: tx.asset.fundraiser,
        amount: tx.asset.amount,
        message: tx.asset.message ? tx.asset.message : "",
      } as FundTxAsset;
    } else {
      this.asset = {} as FundTxAsset;
    }
  }

  protected validateAsset(): ReadonlyArray<TransactionError> {
    const asset = this.assetToJSON() as FundTxAsset;
    const schemaErrors = validator.validate(FundAsset, asset);
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

  public calculateFundsRaised(investments: Array<Investment>): bigint {
    let fundsRaised = BigInt(0);
    investments.map(investment => {
      fundsRaised += BigInt(investment.amount);
    });

    return fundsRaised;
  }

  protected async applyAsset(store: StateStore): Promise<ReadonlyArray<TransactionError>> {
    const errors: TransactionError[] = [];
    const sender = await store.account.get(this.senderId);
    sender.balance -= BigInt(this.asset.amount);
    store.account.set(sender.address, sender);
    const fundraiser = await store.account.getOrDefault(this.asset.fundraiser) as CrowdfundAccount;
    const fundsRaised = this.calculateFundsRaised(fundraiser.asset.investments);

    if (fundraiser.asset.startFunding + FUND_TIME < store.chain.lastBlockHeader.timestamp) {
      errors.push(
        new TransactionError(
          'Fundraiser is expired.',
          this.id,
          '.fundingTime',
          fundraiser.asset.startFunding + FUND_TIME,
          `> ${store.chain.lastBlockHeader.timestamp}`
        )
      );
    }

    if (fundraiser.asset.status !== FUNDING_STATUS) {
      errors.push(
        new TransactionError(
          'Fundraiser is not in funding phase.',
          this.id,
          '.asset.status',
          fundraiser.asset.status,
          FUNDING_STATUS
        )
      );
    }

    if (fundsRaised + BigInt(this.asset.amount) > BigInt(fundraiser.asset.goal)) {
      errors.push(
        new TransactionError(
          'Fundraiser is not accepting your funds',
          this.id,
          '.asset.amount',
          this.asset.amount,
          `should be <= ${(BigInt(fundraiser.asset.goal) - fundraiser.balance).toString()}`
        ),
      );
    }

    const investment: Investment = {
      address: this.senderId,
      amount: this.asset.amount.toString(),
      timestamp: store.chain.lastBlockHeader.timestamp,
      message: this.asset.message ? this.asset.message : "",
    };

    fundraiser.balance += BigInt(this.asset.amount);
    fundraiser.asset = {
      ...fundraiser.asset,
      owner: this.senderPublicKey,
      investments: [
        ...fundraiser.asset.investments,
        investment,
      ],
      status: fundsRaised + BigInt(this.asset.amount) < BigInt(fundraiser.asset.goal) ?
        fundraiser.asset.status :
        FUNDED_STATUS,
    };

    store.account.set(fundraiser.address, fundraiser);
    return errors;
  }

  protected async undoAsset(store: StateStore): Promise<ReadonlyArray<TransactionError>> {
    const errors: TransactionError[] = [];
    const sender = await store.account.get(this.senderId);
    sender.balance += BigInt(this.asset.amount);
    store.account.set(sender.address, sender);

    const fundraiser = await store.account.get(this.asset.fundraiser) as CrowdfundAccount;
    fundraiser.balance -= BigInt(this.asset.amount);
    fundraiser.asset = {
      ...fundraiser.asset,
      investments: fundraiser.asset.investments
        .filter((investment) => investment.address !== this.senderId ||
          (investment.address === this.senderId && investment.amount !== this.asset.amount)),
      status: FUNDING_STATUS,
    };

    store.account.set(fundraiser.address, fundraiser);
    return errors;
  }
}
