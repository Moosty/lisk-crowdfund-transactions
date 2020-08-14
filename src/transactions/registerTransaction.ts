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

import {RegisterAsset} from '../schemas';
import {RegisterTx, RegisterTxAsset} from '../types';
import {assetBytesToPublicKey} from '../utils';
import {FUNDING_STATUS, REGISTER_TYPE} from "../constants";

export class RegisterTransaction extends BaseTransaction {
  public asset: RegisterTxAsset;
  public static TYPE = REGISTER_TYPE;

  public constructor(rawTransaction: unknown) {
    super(rawTransaction);
    const tx = (typeof rawTransaction === 'object' && rawTransaction !== null
      ? rawTransaction
      : {}) as Partial<RegisterTx>;

    if (tx.asset) {
      this.asset = {
        fundraiser: tx.asset.fundraiser ? tx.asset.fundraiser : null,
        goal: tx.asset.goal,
        voteTime: tx.asset.voteTime,
        periods: tx.asset.periods,
        title: tx.asset.title,
        description: tx.asset.description,
        site: tx.asset.site,
        image: tx.asset.image,
        category: tx.asset.category,
        start: tx.asset.start,
      } as RegisterTxAsset;
    } else {
      this.asset = {} as RegisterTxAsset;
    }
  }

  protected validateAsset(): ReadonlyArray<TransactionError> {
    const asset = this.assetToJSON() as RegisterTxAsset;
    const schemaErrors = validator.validate(RegisterAsset, asset);
    const errors = convertToAssetError(
      this.id,
      schemaErrors,
    ) as TransactionError[];

    if (!this.asset.fundraiser) {
      this.asset.fundraiser = this.getPublicKey();
    }

    if (this.getPublicKey() !== this.asset.fundraiser) {
      errors.push(new TransactionError(
        '`.asset.fundraiser` is not the correct fundraiser address for this registration.',
        this.id,
        '.asset.fundraiser',
        this.asset.fundraiser,
        this.getPublicKey(),
      ));
    }

    return errors;
  }

  protected assetToBytes(): Buffer {
    const voteTimeBuffer = intToBuffer(
      this.asset.voteTime, 2
    );
    const periodsBuffer = intToBuffer(
      this.asset.periods, 2
    );
    const startBuffer = intToBuffer(
      this.asset.start, 4
    );
    const goalBuffer = intToBuffer(
      this.asset.goal.toString(),
      constants.BYTESIZES.AMOUNT,
      'big',
    );
    const titleBuffer = this.asset.title
      ? stringToBuffer(this.asset.title)
      : Buffer.alloc(0);
    const descriptionBuffer = this.asset.description
      ? stringToBuffer(this.asset.description)
      : Buffer.alloc(0);
    const siteBuffer = this.asset.site
      ? stringToBuffer(this.asset.site)
      : Buffer.alloc(0);
    const imageBuffer = this.asset.image
      ? stringToBuffer(this.asset.image)
      : Buffer.alloc(0);
    const categoryBuffer = this.asset.category
      ? stringToBuffer(this.asset.category)
      : Buffer.alloc(0);

    return Buffer.concat([
      voteTimeBuffer,
      periodsBuffer,
      goalBuffer,
      titleBuffer,
      descriptionBuffer,
      siteBuffer,
      imageBuffer,
      categoryBuffer,
      startBuffer,
    ]);
  }

  public getPublicKey(): string {
    return assetBytesToPublicKey(this.assetToBytes().toString())
  }

  public async prepare(store: StateStorePrepare): Promise<void> {
    await store.account.cache([
      {
        address: this.senderId,
      },
      {
        address: this.asset.fundraiser ? getAddressFromPublicKey(this.asset.fundraiser) : this.getPublicKey(),
      },
    ]);
  }

  protected verifyAgainstTransactions(
    transactions: ReadonlyArray<RegisterTx>,
  ): ReadonlyArray<TransactionError> {
    this.asset.fundraiser = this.asset.fundraiser ? this.asset.fundraiser : this.getPublicKey();
    return transactions
      .filter(
        tx =>
          tx.type === this.type && tx.asset.fundraiser === this.asset.fundraiser,
      )
      .map(
        tx =>
          new TransactionError(
            'Fundraiser with this address already exist.',
            tx.id,
            '.asset.fundraiser',
            this.asset.fundraiser,
          ),
      );
  }

  // todo: add total periods
  protected async applyAsset(store: StateStore): Promise<ReadonlyArray<TransactionError>> {
    const errors: TransactionError[] = [];
    this.asset.fundraiser = this.asset.fundraiser ? this.asset.fundraiser : this.getPublicKey();
    const fundraiser = await store.account.getOrDefault(this.asset.fundraiser ? getAddressFromPublicKey(this.asset.fundraiser) : getAddressFromPublicKey(this.getPublicKey()));

    if (fundraiser.balance > BigInt(0) || Object.keys(fundraiser.asset).length > 0) {
      errors.push(
        new TransactionError(
          'Fundraiser with this address already exist.',
          this.id,
          '.asset.fundraiser',
          this.asset.fundraiser,
        ),
      );
    }

    fundraiser.publicKey = this.getPublicKey();
    fundraiser.asset = {
      owner: this.senderPublicKey,
      status: FUNDING_STATUS, // status open for funding
      goal: this.asset.goal.toString(),
      voteTime: this.asset.voteTime,
      periods: this.asset.periods,
      title: this.asset.title,
      description: this.asset.description,
      site: this.asset.site,
      image: this.asset.image,
      category: this.asset.category,
      payments: [],
      investments: [],
      votes: [],
      startFunding: store.chain.lastBlockHeader.timestamp,
      startProject: -1,
    };

    store.account.set(fundraiser.address, fundraiser);
    return errors;
  }

  protected async undoAsset(store: StateStore): Promise<ReadonlyArray<TransactionError>> {
    const errors: TransactionError[] = [];
    const fundraiser = await store.account.get(this.asset.fundraiser ? getAddressFromPublicKey(this.asset.fundraiser) : getAddressFromPublicKey(this.getPublicKey()));

    fundraiser.publicKey = undefined;
    fundraiser.asset = {};

    store.account.set(fundraiser.address, fundraiser);
    return errors;
  }
}
