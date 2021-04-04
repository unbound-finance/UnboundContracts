const uDai = artifacts.require("UnboundDollar");
const valuer = artifacts.require("Valuing_01");
const LLC = artifacts.require("LLC_BatDai");

const uniFactory = artifacts.require("UniswapV2Factory");
const testDai = artifacts.require("TestDai");
const testEth = artifacts.require("TestEth");
const testBat = artifacts.require("TestBat");
const testAggregatorBatEth = artifacts.require("TestAggregatorProxyBatEth");
const testAggregatorEthUsd = artifacts.require("TestAggregatorProxyEthUsd");
const testAggregatorDaiUsd = artifacts.require("TestAggregatorProxyDaiUsd");

const uniPool = artifacts.require("UniswapV2Pair");
const mainOracle = artifacts.require('UniswapV2PriceProvider');

const loanRate = 500000;
const feeRate = 5000;
let stablecoinAddress = ""; // Stablecoin-ADDRESS
let UndAddress = ""; // UND-Token-ADDRESS
let valuerAddress = ""; // Valuer-ADDRESS
let LPTAddress = ""; // Liquidity-Pool-Token-ADDRESS
let priceFeedAddress1 = "";
let priceFeedAddress2 = "";
let baseAssetFeed = "";

module.exports = async (deployer, network, accounts) => {
  if (LPTAddress === "") {
    const factory = await uniFactory.deployed();
    const pair = await factory.createPair.sendTransaction(testDai.address, testBat.address);
    LPTAddress = pair.logs[0].args.pair;
  }
  if (priceFeedAddress1 === "") {
    await deployer.deploy(testAggregatorBatEth);
    priceFeedAddress1 = testAggregatorBatEth.address;
  }
  if (priceFeedAddress2 === "") {
    priceFeedAddress2 = testAggregatorEthUsd.address;
  }

  stablecoinAddress = stablecoinAddress || testDai.address;
  const undContract = UndAddress === "" ? await uDai.deployed() : await uDai.at(UndAddress);
  const valueContract = valuerAddress === "" ? await valuer.deployed() : await valuer.at(valuerAddress);
  baseAssetFeed = baseAssetFeed || testAggregatorDaiUsd.address;

  const daiTest = await testDai.deployed();
  const ethTest = await testBat.deployed();
  const pool = await uniPool.at(LPTAddress);
  const pool0 = await pool.token0();
  const pool1 = await pool.token1();

  let isPegged0;
  let isPegged1;

  if (pool0 === daiTest.address) {
    isPegged0 = "true";
    isPegged1 = "false";
  } else {
    isPegged1 = "true";
    isPegged0 = "false";
  }

  await deployer.deploy(
    mainOracle, 
    LPTAddress, 
    [isPegged0, isPegged1], 
    [18, 18],
    priceFeedAddress1,
    5,
    200
  )

  const Oracle = await mainOracle.deployed();

  await deployer.deploy(
    LLC,
    valueContract.address,
    LPTAddress,
    undContract.address,
    Oracle.address
  );

  await valueContract.addLLC.sendTransaction(LLC.address, undContract.address, loanRate, feeRate);
  await undContract.changeValuator.sendTransaction(valueContract.address);
};
