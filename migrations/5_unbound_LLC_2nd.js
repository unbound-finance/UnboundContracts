const uDai = artifacts.require('UnboundDollar');
const valuer = artifacts.require('Valuing_01');
const LLC = artifacts.require('LLC_BatDai');

const uniFactory = artifacts.require('UniswapV2Factory');
const testDai = artifacts.require('TestDai');
const testEth = artifacts.require('TestEth');
const testBat = artifacts.require('TestBat');
const testAggregatorBatEth = artifacts.require('TestAggregatorProxyBatEth');
const testAggregatorEthUsd = artifacts.require('TestAggregatorProxyEthUsd');
const testAggregatorDaiUsd = artifacts.require('TestAggregatorProxyDaiUsd');

const loanRate = 600000;
const feeRate = 4000;
let stablecoinAddress = ''; // Stablecoin-ADDRESS
let UndAddress = ''; // UND-Token-ADDRESS
let valuerAddress = ''; // Valuer-ADDRESS
let LPTAddress = ''; // Liquidity-Pool-Token-ADDRESS
let priceFeedAddress1 = '';
let priceFeedAddress2 = '';
let baseAssetFeed = '';

module.exports = async (deployer, network, accounts) => {
  if (LPTAddress === '') {
    const factory = await uniFactory.deployed();
    const pair = await factory.createPair.sendTransaction(testDai.address, testBat.address);
    LPTAddress = pair.logs[0].args.pair;
  }
  if (priceFeedAddress1 === '') {
    await deployer.deploy(testAggregatorBatEth);
    priceFeedAddress1 = testAggregatorBatEth.address;
  }
  if (priceFeedAddress2 === '') {
    priceFeedAddress2 = testAggregatorEthUsd.address;
  }

  stablecoinAddress = stablecoinAddress || testDai.address;
  const undContract = UndAddress === '' ? await uDai.deployed() : await uDai.at(UndAddress);
  const valueContract = valuerAddress === '' ? await valuer.deployed() : await valuer.at(valuerAddress);
  baseAssetFeed = baseAssetFeed || testAggregatorDaiUsd.address;

  await deployer.deploy(
    LLC,
    valueContract.address,
    LPTAddress,
    stablecoinAddress,
    [priceFeedAddress1, priceFeedAddress2],
    [baseAssetFeed],
    undContract.address
  );

  await valueContract.addLLC.sendTransaction(LLC.address, undContract.address, loanRate, feeRate);
  await undContract.changeValuator.sendTransaction(valueContract.address);
};
