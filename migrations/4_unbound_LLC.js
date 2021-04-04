const uDai = artifacts.require("UnboundDollar");
const valuer = artifacts.require("Valuing_01");
const LLC = artifacts.require("LLC_EthDai");

const uniFactory = artifacts.require("UniswapV2Factory");
const uniPool = artifacts.require("UniswapV2Pair");
const testDai = artifacts.require("TestDai");
const testEth = artifacts.require("TestEth");
const testAggregatorEthUsd = artifacts.require("TestAggregatorProxyEthUsd");
const testAggregatorDaiUsd = artifacts.require("TestAggregatorProxyDaiUsd");
<<<<<<< HEAD
const mainOracle = artifacts.require('UniswapV2PriceProvider');
=======
const uniPair = artifacts.require("UniswapV2Pair");


const Oracle = artifacts.require("UniswapV2PriceProvider");
>>>>>>> origin/new/oracle

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

  v2pair = await uniPair.at(LPTAddress);


  let isPegged0;
  let isPegged1;

  const pool0 = await v2pair.token0();
  const pool1 = await v2pair.token1();

  if(pool0 == testDai.address) {
    isPegged0 = "true";
    isPegged1 = "false"
  }
  else {
    isPegged0 = "false";
    isPegged1 = "true"
  }

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

  const daiTest = await testDai.deployed();
  const ethTest = await testEth.deployed();
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
  console.log(isPegged0);
  console.log(isPegged1)
  await deployer.deploy(
    mainOracle, 
    LPTAddress, 
    [isPegged0, isPegged1], 
    [18, 18],
    priceFeedAddress,
    "160000000000000000",
    500
  )

  const Oracle = await mainOracle.deployed();
    
  await deployer.deploy(
    LLC,
    valueContract.address,
    LPTAddress,
    undContract.address,
    Oracle.address
  );

  await deployer.deploy(LLC, valueContract.address, LPTAddress, undContract.address, oracle.address);

  await valueContract.addLLC(LLC.address, undContract.address, loanRate, feeRate);

  await undContract.changeValuator(valueContract.address);
};
