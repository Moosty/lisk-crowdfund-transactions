import {intToBuffer, stringToBuffer} from '@liskhq/lisk-cryptography';
import {validator} from '@liskhq/lisk-validator';
import {
  BaseTransaction,
  convertToAssetError,
  StateStore,
  StateStorePrepare,
  TransactionError,
} from '@liskhq/lisk-transactions';

import {VoteAsset} from '../schemas';
import {CrowdfundAccount, Investment, Vote, VoteTx, VoteTxAsset} from '../types';
import {ACTIVE_STATUS, PERIOD, VOTE_PASS, VOTE_TIME, VOTE_TYPE, REFUND_STATUS} from "../constants";

export class VoteTransaction extends BaseTransaction {
  readonly asset: VoteTxAsset;
  public static TYPE = VOTE_TYPE;

  public constructor(rawTransaction: unknown) {
    super(rawTransaction);
    const tx = (typeof rawTransaction === 'object' && rawTransaction !== null
      ? rawTransaction
      : {}) as Partial<VoteTx>;

    if (tx.asset) {
      this.asset = {
        fundraiser: tx.asset.fundraiser,
        period: tx.asset.period,
        vote: tx.asset.vote,
      } as VoteTxAsset;
    } else {
      this.asset = {} as VoteTxAsset;
    }
  }

  protected validateAsset(): ReadonlyArray<TransactionError> {
    const asset = this.assetToJSON() as VoteTxAsset;
    const schemaErrors = validator.validate(VoteAsset, asset);
    return convertToAssetError(
      this.id,
      schemaErrors,
    ) as TransactionError[];
  }

  protected assetToBytes(): Buffer {
    const fundraiserBuffer = this.asset.fundraiser
      ? stringToBuffer(this.asset.fundraiser)
      : Buffer.alloc(0);
    const voteBuffer = this.asset.vote
      ? intToBuffer(this.asset.vote, 2)
      : Buffer.alloc(0);
    const periodBuffer = this.asset.period
      ? intToBuffer(this.asset.period, 2)
      : Buffer.alloc(0);

    return Buffer.concat([
      fundraiserBuffer,
      voteBuffer,
      periodBuffer,
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

  public calculateVoteStake(investments: Array<Investment>): bigint {
    let voteStake = BigInt(0);
    investments.map(investment => {
      if (investment.address === this.senderId) {
        voteStake += BigInt(investment.amount);
      }
    });

    return voteStake;
  }

  public calculateCurrentPeriod(currentTime: number, startTime: number): number {
    return Math.ceil((currentTime - startTime) / PERIOD);
  }

  public allowedToVote(currentTime: number, startTime: number, voteTime: number): boolean {
    const currentPeriod = this.calculateCurrentPeriod(currentTime, startTime);
    if (currentPeriod % voteTime === 0) {
      const end = startTime + (currentPeriod * PERIOD);
      const begin = end - VOTE_TIME;
      if (currentTime >= begin && currentTime <= end) {
        return true;
      }
    }
    return false;
  }

  protected async applyAsset(store: StateStore): Promise<ReadonlyArray<TransactionError>> {
    const errors: TransactionError[] = [];

    const fundraiser = await store.account.getOrDefault(this.asset.fundraiser) as CrowdfundAccount;
    const voteStake = this.calculateVoteStake(fundraiser.asset.investments);
    const allowedToVote = this.allowedToVote(
      store.chain.lastBlockHeader.timestamp,
      fundraiser.asset.startProject,
      fundraiser.asset.voteTime);

    if (!allowedToVote) {
      errors.push(
        new TransactionError(
          'Fundraiser is not holding a voting at the moment',
          this.id,
        )
      );
    }

    if (fundraiser.asset.votes.find(
      v => v.address === this.senderId &&
        v.period === this.asset.period)) {
      errors.push(
        new TransactionError(
          'You already voted for this period',
          this.id,
        )
      );
    }

    if (fundraiser.asset.status !== ACTIVE_STATUS) {
      errors.push(
        new TransactionError(
          'Fundraiser is not active',
          this.id,
          '.asset.status',
          fundraiser.asset.status,
          ACTIVE_STATUS
        )
      );
    }
    const vote: Vote = {
      address: this.senderId,
      stake: Number(voteStake / BigInt(fundraiser.asset.goal)),
      period: this.asset.period,
      vote: this.asset.vote,
    };
    const votes = [
      ...fundraiser.asset.votes,
      vote,
    ];
    const voteWeightNo = votes
      .filter(v => v.vote === 0)
      .map(v => v.stake)
      .reduce((accumulator, currentValue) => accumulator + currentValue);

    fundraiser.asset = {
      ...fundraiser.asset,
      votes,
      status: voteWeightNo > VOTE_PASS ? REFUND_STATUS : fundraiser.asset.status,
    };

    store.account.set(fundraiser.address, fundraiser);
    return errors;
  }

  protected async undoAsset(store: StateStore): Promise<ReadonlyArray<TransactionError>> {
    const errors: TransactionError[] = [];

    const fundraiser = await store.account.get(this.asset.fundraiser) as CrowdfundAccount;
    const votes = fundraiser.asset.votes.filter(v =>
      v.address !== this.senderId &&
      v.period !== this.asset.period);
    const voteWeightNo = votes
      .filter(v => v.vote === 0)
      .map(v => v.stake)
      .reduce((accumulator, currentValue) => accumulator + currentValue);
    fundraiser.asset = {
      ...fundraiser.asset,
      votes,
      status: voteWeightNo > VOTE_PASS ? REFUND_STATUS : ACTIVE_STATUS,
    };

    store.account.set(fundraiser.address, fundraiser);
    return errors;
  }
}
