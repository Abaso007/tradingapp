const mongoose = require('mongoose');
const Schema = mongoose.Schema;


const portfolioSchema = new Schema({
  userId: {
    type: String,
    index: true,
    required: false,
  },
  provider: {
    type: String,
    index: true,
    default: 'alpaca',
  },
  name: {
    type: String,
    required: true,
  },
  strategy_id: {
    type: String,
    ref: 'Strategy',
  },
  recurrence: {
    type: String,
    enum: [
      'every_10_seconds',
      'every_30_seconds',
      'every_minute',
      'every_5_minutes',
      'every_15_minutes',
      'hourly',
      'daily',
      'weekly',
      'monthly'
    ],
    default: 'daily',
  },
  initialInvestment: {
    type: Number,
    default: 0,
  },
  cashBuffer: {
    type: Number,
    default: 0,
  },
  retainedCash: {
    type: Number,
    default: 0,
  },
  lastRebalancedAt: {
    type: Date,
    default: null,
  },
  nextRebalanceAt: {
    type: Date,
    default: null,
    index: true,
  },
  nextRebalanceManual: {
    type: Boolean,
    default: false,
  },
  targetPositions: {
    type: [{
      symbol: {
        type: String,
        required: true,
      },
      targetQuantity: {
        type: Number,
        default: null,
      },
      targetValue: {
        type: Number,
        default: null,
      },
      targetWeight: {
        type: Number,
        default: null,
      },
    }],
    default: [],
  },
  composerHoldings: {
    type: [{
      symbol: {
        type: String,
        required: true,
      },
      quantity: {
        type: Number,
        default: null,
      },
      value: {
        type: Number,
        default: null,
      },
      weight: {
        type: Number,
        default: null,
      },
    }],
    default: [],
  },
  composerHoldingsUpdatedAt: {
    type: Date,
    default: null,
  },
  composerHoldingsSource: {
    type: String,
    default: null,
  },
  stocks: {
    type: [{
      symbol: {
        type: String,
        required: true,
      },
      orderID: {
        type: String,
        required: true,
      },
      market: {
        type: String,
        default: null,
      },
      asset_id: {
        type: String,
        default: null,
      },
      outcome: {
        type: String,
        default: null,
      },
      avgCost: {
        type: Number,
        default: null,
      },
      quantity: {
        type: Number,
        required: true,
      },
      currentPrice: {
        type: Number,
        default: null,
      },
    }],
    default: [],
  },
  polymarket: {
    address: {
      type: String,
      default: null,
      trim: true,
    },
    executionMode: {
      type: String,
      default: null,
      trim: true,
    },
    sizeToBudget: {
      type: Boolean,
      default: false,
    },
    sizeToBudgetBasis: {
      type: String,
      default: null,
      trim: true,
    },
    seedFromPositions: {
      type: Boolean,
      default: false,
    },
    authAddress: {
      type: String,
      default: null,
      trim: true,
    },
    backfillPending: {
      type: Boolean,
      default: false,
    },
    backfilledAt: {
      type: String,
      default: null,
      trim: true,
    },
    apiKey: {
      type: String,
      default: null,
      trim: true,
    },
    secret: {
      type: String,
      default: null,
      trim: true,
    },
    passphrase: {
      type: String,
      default: null,
      trim: true,
    },
    lastTradeMatchTime: {
      type: String,
      default: null,
      trim: true,
    },
    lastTradeId: {
      type: String,
      default: null,
      trim: true,
    },
    untradeableTokenIds: {
      type: [String],
      default: [],
    },
    liquidityBlocks: {
      type: [
        {
          asset_id: {
            type: String,
            default: null,
            trim: true,
          },
          buyBlockedUntil: {
            type: String,
            default: null,
            trim: true,
          },
          sellBlockedUntil: {
            type: String,
            default: null,
            trim: true,
          },
          reason: {
            type: String,
            default: null,
            trim: true,
          },
          updatedAt: {
            type: String,
            default: null,
            trim: true,
          },
        },
      ],
      default: [],
    },
    sizingState: {
      makerCash: {
        type: Number,
        default: null,
      },
      holdings: {
        type: [
          {
            market: { type: String, default: null },
            asset_id: { type: String, default: null },
            outcome: { type: String, default: null },
            quantity: { type: Number, default: 0 },
            avgCost: { type: Number, default: null },
            currentPrice: { type: Number, default: null },
          },
        ],
        default: [],
      },
      scale: {
        type: Number,
        default: null,
      },
      scaleBasis: {
        type: String,
        default: null,
        trim: true,
      },
      scaleBudget: {
        type: Number,
        default: null,
      },
      scaleMakerValue: {
        type: Number,
        default: null,
      },
      scaleSetAt: {
        type: String,
        default: null,
        trim: true,
      },
      lastUpdatedAt: {
        type: String,
        default: null,
        trim: true,
      },
    },
    pendingLiveRebalance: {
      updatedAt: {
        type: String,
        default: null,
        trim: true,
      },
      nextRetryAt: {
        type: String,
        default: null,
        trim: true,
      },
      orders: {
        type: [
          {
            asset_id: {
              type: String,
              default: null,
              trim: true,
            },
            market: {
              type: String,
              default: null,
              trim: true,
            },
            outcome: {
              type: String,
              default: null,
              trim: true,
            },
            side: {
              type: String,
              default: null,
              trim: true,
            },
            amount: {
              type: Number,
              default: null,
            },
            price: {
              type: Number,
              default: null,
            },
            notional: {
              type: Number,
              default: null,
            },
            reason: {
              type: String,
              default: null,
              trim: true,
            },
            error: {
              type: String,
              default: null,
              trim: true,
            },
            retryAfter: {
              type: String,
              default: null,
              trim: true,
            },
          },
        ],
        default: [],
      },
    },
  },
  alpaca: {
    executionMode: {
      type: String,
      default: null,
      trim: true,
    },
  },
  budget: {
    type: Number,
    required: false,
  },
  cashLimit: {
    type: Number,
    required: false,
    default: null,
  },
  currentValue: {
    type: Number,
    default: null,
  },
  rebalanceCount: {
    type: Number,
    default: 0,
  },
  pnlValue: {
    type: Number,
    default: 0,
  },
  pnlPercent: {
    type: Number,
    default: 0,
  },
  realizedPnlValue: {
    type: Number,
    default: 0,
  },
  lastPerformanceComputedAt: {
    type: Date,
    default: null,
  },
});

const Portfolio = mongoose.model("Portfolio", portfolioSchema);
module.exports = Portfolio;
