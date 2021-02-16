const uDai = artifacts.require("UnboundDollar");
const valuer = artifacts.require("Valuing_01");
const LLC = artifacts.require("LLC_EthDai");

const testERC777 = artifacts.require("TestERC777");
const testDai = artifacts.require("TestDai");
const testEth = artifacts.require("TestEth");
const testAggregatorEthUsd = artifacts.require("TestAggregatorProxyEthUsd");
const testAggregatorDaiUsd = artifacts.require("TestAggregatorProxyDaiUsd");

const attacker = artifacts.require("Attacker");

const loanRate = 500000;
const feeRate = 5000;
let stablecoinAddress = ""; // Stablecoin-ADDRESS
let UndAddress = ""; // UND-Token-ADDRESS
let valuerAddress = ""; // Valuer-ADDRESS
let priceFeedAddress = "";
let baseAssetFeed = "";

module.exports = async (deployer, network, accounts) => {

  await deployer.deploy(testERC777,"LPT777","LPT777");
  let LPTContract = await testERC777.deployed();
  await LPTContract.initialize(testEth.address, testDai.address);

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

  await deployer.deploy(
    LLC,
    valueContract.address,
    LPTContract.address,
    stablecoinAddress,
    [priceFeedAddress],
    [baseAssetFeed],
    undContract.address
  );

  let vulnerableLLC = await LLC.deployed();
  // console.log('Vulnerable LLC address: ' + vulnerableLLC.address);

  await valueContract.addLLC(vulnerableLLC.address, undContract.address, loanRate, feeRate);
  await undContract.changeValuator(valueContract.address);

  await deployer.deploy(attacker);
};
