const uDai = artifacts.require("UnboundDollar");
const valuer = artifacts.require("Valuing_01");
const LLC = artifacts.require("LLC_LinkDai");

const uniFactory = artifacts.require("UniswapV2Factory");
const testDai = artifacts.require("TestDai");
const testLink = artifacts.require("TestLink");
const testAggregatorLinkUsd = artifacts.require("TestAggregatorProxyLinkUsd");
const testAggregatorDaiUsd = artifacts.require("TestAggregatorProxyDaiUsd");


const loanRate = 600000;
const feeRate = 4000;
let stablecoinAddress = ""; // Stablecoin-ADDRESS
let UndAddress = ""; // UND-Token-ADDRESS
let valuerAddress = ""; // Valuer-ADDRESS
let LPTAddress = ""; // Liquidity-Pool-Token-ADDRESS
let priceFeedAddress = "";
let baseAssetFeed = "";

module.exports = async (deployer, network, accounts) => {
  // if (LPTAddress === "") {
  //   const factory = await uniFactory.deployed();
  //   const pair = await factory.createPair(testDai.address, testLink.address);
  //   LPTAddress = pair.logs[0].args.pair;
  // }

  // stablecoinAddress = stablecoinAddress || testDai.address;
  // const undContract = UndAddress === "" ? await uDai.deployed() : await uDai.at(UndAddress);
  // const valueContract = valuerAddress === "" ? await valuer.deployed() : await valuer.at(valuerAddress);
  // if (priceFeedAddress === "") {
  //   await deployer.deploy(testAggregatorLinkUsd);
  //   priceFeedAddress = testAggregatorLinkUsd.address;
  // }
  // if (baseAssetFeed === "") {
  //   baseAssetFeed = testAggregatorDaiUsd.address;
  // }

  // await deployer.deploy(
  //   LLC,
  //   valueContract.address,
  //   LPTAddress,
  //   stablecoinAddress,
  //   [priceFeedAddress],
  //   [baseAssetFeed],
  //   undContract.address
  // );

  // await valueContract.addLLC(LLC.address, undContract.address, loanRate, feeRate);

  // await undContract.changeValuator(valueContract.address);
};
