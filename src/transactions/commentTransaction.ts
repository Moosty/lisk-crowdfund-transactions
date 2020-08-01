import {intToBuffer, stringToBuffer} from '@liskhq/lisk-cryptography';
import {validator} from '@liskhq/lisk-validator';
import {
  BaseTransaction,
  convertToAssetError,
  StateStore,
  StateStorePrepare,
  TransactionError,
} from '@liskhq/lisk-transactions';

import {CommentAsset} from '../schemas';
import {CommentTx, CommentTxAsset, CrowdfundAccount} from '../types';
import {COMMENT_TYPE,} from "../constants";

export class CommentTransaction extends BaseTransaction {
  readonly asset: CommentTxAsset;
  public static TYPE = COMMENT_TYPE;

  public constructor(rawTransaction: unknown) {
    super(rawTransaction);
    const tx = (typeof rawTransaction === 'object' && rawTransaction !== null
      ? rawTransaction
      : {}) as Partial<CommentTx>;

    if (tx.asset) {
      this.asset = {
        fundraiser: tx.asset.fundraiser,
        comment: tx.asset.comment,
        type: tx.asset.type,
      } as CommentTxAsset;
    } else {
      this.asset = {} as CommentTxAsset;
    }
  }

  protected validateAsset(): ReadonlyArray<TransactionError> {
    const asset = this.assetToJSON() as CommentTxAsset;
    const schemaErrors = validator.validate(CommentAsset, asset);
    return convertToAssetError(
      this.id,
      schemaErrors,
    ) as TransactionError[];
  }

  protected assetToBytes(): Buffer {
    const fundraiserBuffer = this.asset.fundraiser
      ? stringToBuffer(this.asset.fundraiser)
      : Buffer.alloc(0);
    const commentBuffer = this.asset.comment
      ? stringToBuffer(this.asset.comment)
      : Buffer.alloc(0);
    const typeBuffer = this.asset.type
      ? intToBuffer(this.asset.type, 2)
      : Buffer.alloc(0);

    return Buffer.concat([
      fundraiserBuffer,
      commentBuffer,
      typeBuffer,
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

  protected async applyAsset(store: StateStore): Promise<ReadonlyArray<TransactionError>> {
    const errors: TransactionError[] = [];
    const fundraiser = await store.account.getOrDefault(this.asset.fundraiser) as CrowdfundAccount;

    if (this.asset.type === 1 &&
      (this.senderPublicKey !== fundraiser.asset.owner &&
        !fundraiser.asset.investments.find(i => i.address === this.senderId))) {
      errors.push(
        new TransactionError(
          'You are not a donor of this fundraiser',
          this.id,
          '.senderId',
          this.senderId,
        )
      );
    }

    if (this.asset.type === 0 && this.senderPublicKey !== fundraiser.asset.owner) {
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

    return errors;
  }

  protected async undoAsset(store: StateStore): Promise<ReadonlyArray<TransactionError>> {
    const errors: TransactionError[] = [];
    await store.account.get(this.senderId);
    return errors;
  }
}
