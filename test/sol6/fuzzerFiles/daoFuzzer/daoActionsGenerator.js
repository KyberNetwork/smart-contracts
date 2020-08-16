const BN = web3.utils.BN;
const {zeroBN, zeroAddress} = require('../../../helper.js');
const Helper = require('../../../helper.js');

const {DEPOSIT, DELEGATE, WITHDRAW, NO_ACTION} = require('../stakingFuzzer/stakingActionsGenerator.js');
const {genRandomBN, genRandomSeed} = require('../randomNumberGenerator.js');

const CREATE_CAMPAIGN = 'submit_new_campaign';
const CANCEL_CAMPAIGN = 'cancel_campaign';
const VOTE = 'vote';
const GET_REWARD = 'get_reward';

const BASE = 100;

const CAMPAIGN_TYPE_GENERAL = 0;
const CAMPAIGN_TYPE_NETWORK_FEE = 1;
const CAMPAIGN_TYPE_FEE_BRR = 2;

const precision = new BN(10).pow(new BN(18));

const POWER_128 = new BN(2).pow(new BN(128));

module.exports = {
  CREATE_CAMPAIGN,
  CANCEL_CAMPAIGN,
  VOTE,
  GET_REWARD,
  CAMPAIGN_TYPE_GENERAL,
  CAMPAIGN_TYPE_NETWORK_FEE,
  CAMPAIGN_TYPE_FEE_BRR
};

module.exports.genNextOp = function genNextOp (loop, numRuns) {
  let rand = genRandomSeed(BASE);
  let depositWeight;
  let withdrawWeight;
  let delegateWeight;
  // weighted operations
  // at the start, should have more deposits, then taper off
  let startRatio = loop / numRuns;
  if (startRatio < 0.003) {
    depositWeight = 70;
    withdrawWeight = 75;
    delegateWeight = 90;
    createCampaignWeight = 100;
    cancelCampaignWeight = 100;
    voteWeight = 100;
    claimReward = 100;
  } else {
    depositWeight = 10;
    withdrawWeight = 20;
    delegateWeight = 30;
    createCampaignWeight = 40;
    cancelCampaignWeight = 45;
    voteWeight = 90;
    claimReward = 95;
  }

  if (rand < depositWeight) return DEPOSIT;
  if (rand < withdrawWeight) return WITHDRAW;
  if (rand < delegateWeight) return DELEGATE;
  if (rand < createCampaignWeight) return CREATE_CAMPAIGN;
  if (rand < cancelCampaignWeight) return CANCEL_CAMPAIGN;
  if (rand < voteWeight) return VOTE;
  if (rand < claimReward) return GET_REWARD;

  return NO_ACTION;
};

// random - campaignType, start-time, minPercentageInPrecision, cInPrecision
// not random - start-end epoch, campaign period, epoch-option, tInPrecision, options

module.exports.genSubmitNewCampaign = async (daoContract, epochPeriod, startTime, currentBlockTime, epoch) => {
  rand = genRandomSeed(100);
  // create startTimestamp = [startEpoch, startEpoch + epochPeriod * 1.5]
  let startTimestamp = genRandomBN(
    new BN(startTime + epochPeriod * (epoch - 1)),
    new BN(startTime + epochPeriod * epoch + epochPeriod / 2)
  );
  if (genRandomSeed(100) >= 98) {
    startTimestamp = genRandomBN(new BN(startTime), new BN(startTime + epochPeriod * epoch * 2));
  }
  let startEpoch = getEpochNumber(epochPeriod, startTime, startTimestamp);
  let result = {
    campaignType: CAMPAIGN_TYPE_GENERAL,
    startTimestamp: startTimestamp,
    endTimestamp: startTimestamp + 1,
    minPercentageInPrecision: precision,
    cInPrecision: precision,
    tInPrecision: precision,
    options: [new BN(1), new BN(2)],
    isValid: true,
    msg: 'create general campaign at epoch ' + startEpoch
  };
  // test create campaign at the past
  if (startTimestamp.lt(new BN(currentBlockTime))) {
    result.msg = 'validateParams: start in the past';
    result.isValid = false;
    return result;
  }
  // generate random where campaign endTimestamp is small
  if (genRandomSeed(100) >= 98) {
    // Note: when minCampaignPeriod is 0 then endTimestamp can be startTimestamp - 1
    // pls review the condition: endTimestamp - startTimestamp + 1 >= minCampaignDurationInSeconds
    // test create campaign startTime < endTime
    result.msg = 'validateParams: campaign duration is low';
    result.endTimestamp = currentBlockTime - 2 - genRandomSeed(100);
    result.isValid = false;
    return result;
  }
  // check number of campaign in this epoch
  let listCampaignIDs = await daoContract.getListCampaignIDs(startEpoch);
  let maxCampaign = await daoContract.MAX_EPOCH_CAMPAIGNS();
  if (listCampaignIDs.length == maxCampaign.toNumber()) {
    result.msg = 'validateParams: too many campaigns';
    result.isValid = false;
    return result;
  }

  let endTimestamp = startTimestamp.add(new BN(epochPeriod / 2));
  let endEpoch = getEpochNumber(epochPeriod, startTime, endTimestamp);
  result.endTimestamp = endTimestamp;
  if (!startEpoch.eq(endEpoch)) {
    result.isValid = false;
    result.msg = 'validateParams: start & end not same epoch';
    return result;
  }

  if (startEpoch.gt(epoch.add(new BN(1)))) {
    result.isValid = false;
    result.msg = 'validateParams: only for current or next epochs';
    return result;
  }
  // test create campaign options.length > MAX_CAMPAIGN_OPTIONS
  if (genRandomSeed(100) >= 98) {
    options = [];
    for (let i = 0; i < 9; i++) {
      options.push(1 + genRandomSeed(20));
    }
    result.msg = 'validateParams: invalid number of options';
    result.options = options;
    result.isValid = false;
    return result;
  }
  // normal case:
  // minPercentageInPrecision is random (0, precision/5)
  // cInPrecision (minPercentage, precision/2)
  // tInPrecision = precision
  if (rand >= 90) {
    result.minPercentageInPrecision = genRandomBN(precision.add(new BN(1)), precision.mul(new BN(2)));
    result.isValid = false;
    result.msg = 'validateParams: min percentage is high';
    return result;
  } else {
    result.minPercentageInPrecision = genRandomBN(new BN(0), precision.div(new BN(5)));
  }
  if (rand >= 88) {
    result.cInPrecision = genRandomBN(POWER_128, POWER_128.mul(new BN(2)));
    result.isValid = false;
    result.msg = 'validateParams: c is high';
    return result;
  } else {
    result.cInPrecision = genRandomBN(result.minPercentageInPrecision, precision.div(new BN(2)));
  }
  if (rand >= 86) {
    result.tInPrecision = genRandomBN(POWER_128, POWER_128.mul(new BN(2)));
    result.isValid = false;
    result.msg = 'validateParams: t is high';
    return result;
  } else {
    result.tInPrecision = precision;
  }

  let validOption = genRandomSeed(100) <= 97;
  if (rand < 30) {
    result.campaignType = CAMPAIGN_TYPE_NETWORK_FEE;
    lastOption = genRandomBN(new BN(1000), new BN(5500));
    result.options = [new BN(0), new BN(200), lastOption];
    campID = await daoContract.networkFeeCampaigns(startEpoch);
    if (!new BN(campID).eq(new BN(0))) {
      result.isValid = false;
      result.msg = 'validateParams: already had network fee campaign for this epoch';
    } else {
      if (lastOption.gt(new BN(4999))) {
        result.isValid = false;
        result.msg = 'validateParams: network fee must be smaller then BPS / 2';
      } else {
        result.msg = 'create network fee campaign at epoch ' + startEpoch;
      }
    }
  } else if (rand < 60) {
    result.campaignType = CAMPAIGN_TYPE_FEE_BRR;
    campID = await daoContract.brrCampaigns(startEpoch);
    lastRewardInBps = genRandomBN(new BN(0), new BN(8000));
    result.options = [new BN(2000), new BN(3000).mul(POWER_128), new BN(3000).mul(POWER_128).add(lastRewardInBps)];

    if (!new BN(campID).eq(new BN(0))) {
      result.isValid = false;
      result.msg = 'validateParams: already had brr campaign for this epoch';
    } else {
      if (lastRewardInBps.gt(new BN(7000))) {
        result.isValid = false;
        result.msg = "revert validateParams: rebate + reward can't be bigger than BPS";
      } else {
        result.msg = 'create new brr campaign at epoch ' + startEpoch;
      }
    }
  } else {
    if (!validOption) {
      result.options = [new BN(0), new BN(1), new BN(2)];
      result.isValid = false;
      result.msg = 'validateParams: general campaign option is 0';
    }
  }
  return result;
};

module.exports.getEpochNumber = getEpochNumber;
function getEpochNumber (epochPeriod, startTime, timestamp) {
  if (new BN(timestamp).lt(new BN(startTime))) return new BN(0);
  return new BN(timestamp)
    .sub(new BN(startTime))
    .div(new BN(epochPeriod))
    .add(new BN(1));
}

// random select a campaignID from current epoch or next epoch
module.exports.genCancelCampaign = async (daoContract, currentBlockTime, epoch) => {
  let campaigns = await daoContract.getListCampaignIDs(epoch);
  campaigns = campaigns.concat(await daoContract.getListCampaignIDs(epoch.add(new BN(1))));
  if (campaigns.length == 0) {
    return undefined;
  }
  let campaignID = campaigns[genRandomSeed(campaigns.length)];
  let numCampaign = await daoContract.numberCampaigns();
  // with a small possibility, random campaignID in a range from [1, numberCampaign * 1.5]
  if (genRandomSeed(100) >= 90) {
    campaignID = genRandomBN(new BN(0), new BN((numCampaign * 3) / 2));
  }
  if (campaignID === 0 || campaignID > numCampaign.toNumber()) {
    return {
      blockTime: currentBlockTime,
      isValid: false,
      msg: "cancelCampaign: campaignID doesn't exist",
      campaignID
    };
  }

  let campaignDetails = await daoContract.getCampaignDetails(campaignID);
  if(campaignDetails.startTimestamp.eq(new BN(0))) {
    return {
      blockTime: currentBlockTime,
      isValid: false,
      msg: "cancelCampaign: campaignID doesn't exist",
      campaignID
    };
  }
  if (campaignDetails.startTimestamp <= currentBlockTime) {
    return {
      blockTime: currentBlockTime,
      isValid: false,
      msg: 'cancelCampaign: campaign already started',
      campaignID
    };
  }

  return {
    blockTime: currentBlockTime,
    isValid: true,
    msg: `cancel Campaign ${campaignID} in epoch ${epoch}`,
    campaignID
  };
};

// random select a campaign ID from this epoch and select random option
module.exports.genVote = async (daoContract, currentBlockTime, epoch, stakers) => {
  let campaigns = await daoContract.getListCampaignIDs(epoch);
  let staker = stakers[genRandomSeed(stakers.length)];
  if (campaigns.length == 0) {
    if (genRandomSeed(100) >= 90) {
      numCampaign = await daoContract.numberCampaigns();
      return {
        staker,
        campaignID: new BN(numCampaign).add(new BN(2)),
        option: new BN(1),
        isValid: false,
        msg: "vote: campaign doesn't exist"
      };
    }
    // returns undefined so simulater will genVote instead
    return undefined;
  }
  let campaignID = campaigns[genRandomSeed(campaigns.length)];
  let campaignDetails = await daoContract.getCampaignDetails(campaignID);

  let option = genRandomSeed(campaignDetails.options.length + 1);
  let result = {
    staker,
    campaignID,
    option: new BN(option),
    isValid: true,
    msg: ''
  };
  if (campaignDetails.startTimestamp > currentBlockTime) {
    result.isValid = false;
    result.msg = 'vote: campaign not started';
    return result;
  }

  if (campaignDetails.endTimestamp < currentBlockTime) {
    result.isValid = false;
    result.msg = 'vote: campaign already ended';
    return result;
  }

  if (option === 0) {
    result.isValid = false;
    result.msg = 'vote: option is 0';
    return result;
  }

  if (genRandomSeed(100) >= 95) {
    result.option = campaignDetails.options.length + 1 + genRandomSeed(100);
    result.isValid = false;
    result.msg = 'vote: option is not in range';
    return result;
  }

  result.msg = `success campaignID=${campaignID} option=${option}`;
  return result;
};
