const uDai = artifacts.require("UnboundDollar");
const valuer = artifacts.require("Valuing_01");
const LLC = artifacts.require("LLC_EthDai");

const uniFactory = artifacts.require("UniswapV2Factory");
const testDai = artifacts.require("TestDai");
const testEth = artifacts.require("TestEth");
const testAggregatorEthUsd = artifacts.require("TestAggregatorProxyEthUsd");
const testAggregatorDaiUsd = artifacts.require("TestAggregatorProxyDaiUsd");
const uniPair = artifacts.require("UniswapV2Pair");


const Oracle = artifacts.require("UniswapV2PriceProvider");

const loanRate = 500000;
const feeRate = 5000;
let stablecoinAddress = ""; // Stablecoin-ADDRESS
let UndAddress = ""; // UND-Token-ADDRESS
let valuerAddress = ""; // Valuer-ADDRESS
let LPTAddress = ""; // Liquidity-Pool-Token-ADDRESS
let priceFeedAddress = "";
let baseAssetFeed = "";
let v2pair;

module.exports = async (deployer, network, accounts) => {
  if (LPTAddress === "") {
    const factory = await uniFactory.deployed();
    const pair = await factory.createPair(testDai.address, testEth.address);
    LPTAddress = pair.logs[0].args.pair;
  }

  // // v2pair = await uniPair.at(LPTAddress);


  // let isPegged0;
  // let isPegged1;

  // const pool0 = await v2pair.token0();
  // const pool1 = await v2pair.token1();

  // if(pool0 == testDai.address) {
  //   isPegged0 = "true";
  //   isPegged1 = "false"
  // }
  // else {
  //   isPegged0 = "false";
  //   isPegged1 = "true"
  // }

  // if()

  stablecoinAddress = stablecoinAddress || testDai.address;
  const undContract = UndAddress === "" ? await uDai.deployed() : await uDai.at(UndAddress);
  const valueContract = valuerAddress === "" ? await valuer.deployed() : await valuer.at(valuerAddress);
  if (priceFeedAddress === "") {
    await deployer.deploy(testAggregatorEthUsd);
    priceFeedAddress = testAggregatorEthUsd.address;
  }
  if (baseAssetFeed === "") {
    await deployer.deploy(testAggregatorDaiUsd);
    baseAssetFeed = testAggregatorDaiUsd.address;
  }
  // deploy oracle here

  const oracle = await deployer.deploy(
    Oracle,
    LPTAddress,
    // [true, false],
    [18, 18],
    [testAggregatorEthUsd.address],
    "900000000000000000", //10%
    5000,
    testDai.address
  );

  await deployer.deploy(LLC, valueContract.address, LPTAddress, undContract.address, oracle.address);

  await valueContract.addLLC(LLC.address, undContract.address, loanRate, feeRate);

  await undContract.changeValuator(valueContract.address);
};
