export const RegisterAsset = {
  type: 'object',
  required: ['fundraiser', 'goal', 'voteTime', 'periods', 'title', 'description', 'site', 'image'],
  properties: {
    fundraiser: {
      type: 'string',
      format: 'publicKey',
    },
    goal: {
      type: 'string',
      format: 'int64'
    },
    voteTime: {
      type: 'integer',
      minimum: 1,
    },
    periods: {
      type: 'integer',
      minimum: 1,
    },
    title: {
      type: 'string',
      maxLength: 50,
    },
    description: {
      type: 'string',
    },
    site: {
      type: 'string',
      maxLength: 200,
    },
    image: {
      type: 'string',
    },
  }
}

export const ClaimAsset = {
  type: 'object',
  required: ['fundraiser', 'period', 'amount', 'message'],
  properties: {
    fundraiser: {
      type: 'string',
      format: 'publicKey',
    },
    period: {
      type: 'integer',
      minimum: 0
    },
    amount: {
      type: 'string',
      format: 'int64',
    },
    message: {
      type: 'string',
      minLength: 1,
      maxLength: 255,
    }
  }
}

export const FundAsset = {
  type: 'object',
  required: ['fundraiser', 'amount'],
  properties: {
    fundraiser: {
      type: 'string',
      format: 'publicKey',
    },
    amount: {
      type: 'string',
      format: 'int64',
    },
    message: {
      type: 'string',
      maxLength: '64',
    }
  }
}

export const RefundAsset = {
  type: 'object',
  required: ['fundraiser', 'amount'],
  properties: {
    fundraiser: {
      type: 'string',
      format: 'publicKey',
    },
    amount: {
      type: 'string',
      format: 'int64'
    }
  }
}

export const StartAsset = {
  type: 'object',
  required: ['fundraiser', 'timestamp'],
  properties: {
    fundraiser: {
      type: 'string',
      format: 'publicKey',
    },
    timestamp: {
      type: 'integer',
      minimum: 1
    }
  }
}

export const VoteAsset = {
  type: 'object',
  required: ['fundraiser', 'period', 'vote'],
  properties: {
    fundraiser: {
      type: 'string',
      format: 'publicKey',
    },
    period: {
      type: 'integer',
      minimum: 1
    },
    vote: {
      type: 'integer',
      minimum: 0,
      maximum: 1,
    }
  }
}

export const CommentAsset = {
  type: 'object',
  required: ['fundraiser', 'comment', 'type'],
  properties: {
    fundraiser: {
      type: 'string',
      format: 'publicKey',
    },
    comment: {
      type: 'string',
      minLength: '1',
      maxLength: '255'
    },
    type: {
      type: 'integer',
      minimum: 0, // owner update
      maximum: 1, // comment
    }
  }
}
