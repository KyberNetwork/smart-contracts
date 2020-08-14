const BN = web3.utils.BN;
const Helper = require('../../../helper.js');
const {precisionUnits, zeroBN} = require('../../../helper.js');

const {
  getEpochNumber,
  CAMPAIGN_TYPE_GENERAL,
  CAMPAIGN_TYPE_NETWORK_FEE,
  CAMPAIGN_TYPE_FEE_BRR
} = require('./daoActionsGenerator.js');
const {assert} = require('chai');

let campaignData = {};
let epochCampaigns = {};
let totalEpochPoints = {};
let numberVotes = {};
let stakerVotedOption = {};
let networkFeeCampaigns = {};
let brrCampaigns = {};

module.exports = {
  campaignData,
  epochCampaigns,
  totalEpochPoints,
  numberVotes,
  stakerVotedOption,
  networkFeeCampaigns,
  brrCampaigns
};

let startTime;
let epochPeriod;
let numberCampaigns = new BN(0);

module.exports.setTime = function (_startTime, _epochPeriod) {
  startTime = _startTime;
  epochPeriod = _epochPeriod;
};

module.exports.submitCampaign = function (
  campType,
  startCampaignTime,
  endCampaignTime,
  minPercentageInPrecision,
  cInPrecision,
  tInPrecision,
  options,
  totalKNCSupply
) {
  numberCampaigns = numberCampaigns.add(new BN(1));
  let epoch = getEpochNumber(epochPeriod, startTime, startCampaignTime);
  let campaignId = numberCampaigns;
  if (epoch in epochCampaigns) {
    epochCampaigns[epoch].push(campaignId);
  } else {
    epochCampaigns[epoch] = [campaignId];
  }

  if (campType == CAMPAIGN_TYPE_NETWORK_FEE) {
    networkFeeCampaigns[epoch] = campaignId;
  } else if (campType == CAMPAIGN_TYPE_FEE_BRR) {
    brrCampaigns[epoch] = campaignId;
  }

  votePerOption = [];
  for (let i = 0; i < options.length; i++) votePerOption.push(new BN(0));

  campaignVoteData = {
    totalVotes: new BN(0),
    votePerOption
  };

  campaignData[campaignId] = {
    campaignType: campType,
    campaignId,
    startTimestamp: startCampaignTime,
    endTimestamp: endCampaignTime,
    minPercentageInPrecision,
    cInPrecision,
    tInPrecision,
    options: options,
    totalKNCSupply: totalKNCSupply,
    campaignVoteData
  };
};

module.exports.cancelCampaign = function (campaignId) {
  assert(campaignId in campaignData, 'campaignId not exits in DaoSimulator.campaignData');
  campaign = campaignData[campaignId];
  let epoch = getEpochNumber(epochPeriod, startTime, campaign.startTimestamp);
  if (campaign.campaignType == CAMPAIGN_TYPE_NETWORK_FEE) {
    assert(epoch in networkFeeCampaigns, 'networkFeeCampaigns is not exist');
    delete networkFeeCampaigns[epoch];
  } else if (campaign.campaignType == CAMPAIGN_TYPE_FEE_BRR) {
    assert(epoch in brrCampaigns, 'brrCampaigns is not exist');
    delete brrCampaigns[epoch];
  }

  delete campaignData[campaignId];
  assert(epoch in epochCampaigns, 'epoch is not exist in DaoSimulator.epochCampaigns');
  let campaignIds = epochCampaigns[epoch];
  for (let i = 0; i < campaignIds.length; i++) {
    if (campaignIds[i] == campaignId) {
      campaignIds[i] = campaignIds[campaignIds.length - 1];
      campaignIds.pop();
      break;
    }
  }
};

module.exports.vote = function (campaignId, option, staker, totalStake, epoch) {
  let lastVotedOption = undefined;
  if (staker in stakerVotedOption) {
    if (campaignId in stakerVotedOption[staker]) {
      lastVotedOption = stakerVotedOption[staker][campaignId];
    }
  }

  assert(campaignId in campaignData, 'campaignId not exits in DaoSimulator.campaignData');
  let voteData = campaignData[campaignId].campaignVoteData;
  if (lastVotedOption == undefined) {
    // increase number campaigns that the staker has voted at the current epoch
    if (!(staker in numberVotes)) numberVotes[staker] = {};
    addValueToDictionay(numberVotes[staker], epoch, new BN(1));
    addValueToDictionay(totalEpochPoints, epoch, totalStake);
    voteData.votePerOption[option.sub(new BN(1))] = voteData.votePerOption[option.sub(new BN(1))].add(totalStake);
    voteData.totalVotes = voteData.totalVotes.add(totalStake);
  } else {
    voteData.votePerOption[lastVotedOption.sub(new BN(1))] = voteData.votePerOption[
      lastVotedOption.sub(new BN(1))
    ].sub(totalStake);

    voteData.votePerOption[option.sub(new BN(1))] = voteData.votePerOption[option.sub(new BN(1))].add(totalStake);
  }

  if (!(staker in stakerVotedOption)) stakerVotedOption[staker] = {};
  stakerVotedOption[staker][campaignId] = option;
};

module.exports.getCampaignWinningOptionAndValue = function (campaignID) {
  assert(campaignID in campaignData, 'campaignId not exits in DaoSimulator.campaignData');
  campaign = campaignData[campaignID];
  let totalSupply = campaign.totalKNCSupply;
  Helper.assertGreater(totalSupply, new BN(0), 'zero total supply');
  let totalVotes = campaign.campaignVoteData.totalVotes;
  let voteCounts = campaign.campaignVoteData.votePerOption;

  let result = {
    totalVotes,
    voteCounts,
    totalSupply,
    campaignType: campaign.campaignType,
    winOption: new BN(0),
    winValue: new BN(0)
  };

  let winOption = new BN(0);
  let maxVotedCount = new BN(0);
  for (let i = 0; i < voteCounts.length; i++) {
    if (voteCounts[i].gt(maxVotedCount)) {
      winOption = new BN(i + 1);
      maxVotedCount = voteCounts[i];
    } else if (voteCounts[i].eq(maxVotedCount)) {
      winOption = new BN(0);
    }
  }

  if (winOption.eq(new BN(0))) {
    return result;
  }

  let votedPercentage = totalVotes.mul(precisionUnits).div(totalSupply);
  if (campaign.minPercentageInPrecision.gt(votedPercentage)) {
    return result;
  }

  let x = campaign.tInPrecision.mul(votedPercentage).div(precisionUnits);
  if (!x.gt(campaign.cInPrecision)) {
    let y = campaign.cInPrecision.sub(x);
    if (maxVotedCount.mul(precisionUnits).lt(y.mul(totalVotes))) {
      return result;
    }
  }

  result.winOption = winOption;
  result.winValue = campaign.options[winOption.sub(new BN(1))];
  return result;
};

function addValueToDictionay (dic, key, value) {
  if (key in dic) {
    dic[key] = dic[key].add(value);
  } else {
    dic[key] = value;
  }
}

function subValueToDictionay (dic, key, value) {
  assert(key in dic, `not exist key=${key} dic=${dic}`);
  dic[key] = dic[key].sub(value);
}

module.exports.handlewithdraw = function (staker, reduceAmount, epoch, currentBlockTime) {
  if (!(staker in numberVotes)) return;
  if (!(epoch in numberVotes[staker])) return;
  //if numberVotes contains value for state and epoch, that mean numVotes!=0
  numVote = numberVotes[staker][epoch];
  subValueToDictionay(totalEpochPoints, epoch, reduceAmount.mul(numVote));

  if (!(epoch in epochCampaigns)) return;
  let campaignIds = epochCampaigns[epoch];

  for (const campaignId of campaignIds) {
    if (!(staker in stakerVotedOption)) continue;
    if (!(campaignId in stakerVotedOption[staker])) continue;

    votedOption = stakerVotedOption[staker][campaignId];

    assert(campaignId in campaignData, 'campaignId not exits in DaoSimulator.campaignData');
    let campaign = campaignData[campaignId];
    // check if campaign has ended
    if (campaign.endTimestamp < currentBlockTime) continue;
    campaign.campaignVoteData.totalVotes = campaign.campaignVoteData.totalVotes.sub(reduceAmount);
    campaign.campaignVoteData.votePerOption[votedOption.sub(new BN(1))] = campaign.campaignVoteData.votePerOption[
      votedOption.sub(new BN(1))
    ].sub(reduceAmount);
  }
};

module.exports.getStakerVoteCount = function (staker, epoch, totalStake) {
  if (!(staker in numberVotes)) return zeroBN;
  if (!(epoch in numberVotes[staker])) return zeroBN;
  return numberVotes[staker][epoch];
};

module.exports.getTotalEpochPoints = function (epoch) {
  if (!(epoch in totalEpochPoints)) return zeroBN;
  return totalEpochPoints[epoch];
};
