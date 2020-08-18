import {intToBuffer, stringToBuffer, getAddressFromPublicKey} from '@liskhq/lisk-cryptography';
import {validator} from '@liskhq/lisk-validator';
import {
  BaseTransaction,
  convertToAssetError,
  StateStore,
  StateStorePrepare,
  TransactionError,
} from '@liskhq/lisk-transactions';

import {StartAsset} from '../schemas';
import {CrowdfundAccount, StartTx, StartTxAsset, Investment} from '../types';
import {START_TYPE, FUNDED_STATUS, ACTIVE_STATUS} from "../constants";

export class StartTransaction extends BaseTransaction {
  readonly asset: StartTxAsset;
  public static TYPE = START_TYPE;

  public constructor(rawTransaction: unknown) {
    super(rawTransaction);
    const tx = (typeof rawTransaction === 'object' && rawTransaction !== null
      ? rawTransaction
      : {}) as Partial<StartTx>;

    if (tx.asset) {
      this.asset = {
        fundraiser: tx.asset.fundraiser,
        timestamp: tx.asset.timestamp,
      } as StartTxAsset;
    } else {
      this.asset = {} as StartTxAsset;
    }
  }

  protected validateAsset(): ReadonlyArray<TransactionError> {
    const asset = this.assetToJSON() as StartTxAsset;
    const schemaErrors = validator.validate(StartAsset, asset);
    return convertToAssetError(
      this.id,
      schemaErrors,
    ) as TransactionError[];
  }

  protected assetToBytes(): Buffer {
    const fundraiserBuffer = this.asset.fundraiser
      ? stringToBuffer(this.asset.fundraiser)
      : Buffer.alloc(0);
    const timestampBuffer = intToBuffer(
      this.asset.timestamp, 4
    );

    return Buffer.concat([
      fundraiserBuffer,
      timestampBuffer,
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
    const fundsRaised = this.calculateFundsRaised(fundraiser.asset.investments);

    if (fundraiser.asset.owner !== this.senderPublicKey) {
      errors.push(
        new TransactionError(
          'Fundraiser is not owned by you.',
          this.id,
          '.senderPublicKey',
          this.senderPublicKey,
          fundraiser.asset.owner,
        )
      );
    }

    if (fundsRaised < BigInt(fundraiser.asset.goal)) {
      errors.push(
        new TransactionError(
          'Fundraiser is not fully funded',
          this.id,
          '.asset.amount',
          fundsRaised.toString(),
          fundraiser.asset.goal,
        ),
      );
    }

    if (this.asset.timestamp < store.chain.lastBlockHeader.timestamp) {
      errors.push(
        new TransactionError(
          'Timestamp should be in the future',
          this.id,
          '.asset.timestamp',
          this.asset.timestamp,
          `> ${store.chain.lastBlockHeader.timestamp}`,
        ),
      );
    }

    if (fundraiser.asset.status !== FUNDED_STATUS) {
      errors.push(
        new TransactionError(
          'Fundraiser has wrong status',
          this.id,
          '.asset.status',
          fundraiser.asset.status,
          FUNDED_STATUS,
        ),
      );
    }

    fundraiser.asset = {
      ...fundraiser.asset,
      status: ACTIVE_STATUS,
      startProject: this.asset.timestamp,
    };

    store.account.set(fundraiser.address, fundraiser);
    return errors;
  }

  protected async undoAsset(store: StateStore): Promise<ReadonlyArray<TransactionError>> {
    const errors: TransactionError[] = [];
    const fundraiser = await store.account.get(getAddressFromPublicKey(this.asset.fundraiser)) as CrowdfundAccount;
    fundraiser.asset = {
      ...fundraiser.asset,
      status: FUNDED_STATUS,
      startProject: -1,
    };

    store.account.set(fundraiser.address, fundraiser);
    return errors;
  }
}
