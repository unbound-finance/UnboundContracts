const uDai = artifacts.require("UnboundDollar");
const valuing = artifacts.require("Valuing_01");
// const test = artifacts.require("../contracts/testLPT.sol");
const LLC = artifacts.require("LLC_EthDai");

const uniFactory = artifacts.require("UniswapV2Factory");
const uniPair = artifacts.require("UniswapV2Pair");
const router = artifacts.require("UniswapV2Router02");

const testDai = artifacts.require("TestDai");
const testDai13 = artifacts.require("TestDai13");
const testDai19 = artifacts.require("TestDai19");
const testEth = artifacts.require("TestEth");
const testLink = artifacts.require("TestLink");
const weth8 = artifacts.require("WETH9");
// const feeSplitter = artifacts.require("feeSplitter");
// const LPTstake = artifacts.require("unboundStaking");

// const priceFeedAddress = "!!!! ENTER Price Feed ADDRESS HERE !!!!"

const LPTAddresses = [
  {
    LPAddress: "",
    chainLinkFeeds: [],
    baseAssetFeeds: []
  },
  {
    LPAddress: "",
    chainLinkFeeds: [],
    baseAssetFeeds: []
  }
]; // enter LP addresses here



// const baseAssetFeed = "!!!!ENTER Base Asset Feed ADDRESS HERE!!!!";

// const valueAddress = "!!!!ENTER VALUING ADDRESS HERE!!!!";

const loanRate = "ENTER DESIRED LOAN RATE";

const feeRate = "ENTER DESIRED FEE RATE"

// Deploys UND and 
module.exports = async (deployer, network, accounts) => {
  const safuAddr = accounts[1];
  const devFundAddr = accounts[1];

  await deployer.deploy(uDai, "Unbound Dollar", "UND", safuAddr, devFundAddr);
  const UND = await uDai.deployed();

  await deployer.deploy(valuing);
  const valueContract = valuing.deployed();

  await UND.changeValuator(valueContract.address);

  for (let i = 0; i <LPTAddresses.length; i++) {
    await deployer.deploy(LLC, valueAddress, LPTAddresses[i].LPAddress, LPTAddresses[i].chainLinkFeeds, LPTAddresses[i].baseAssetFeeds, UND.address);
    const lockContract = await LLC.deployed();
    await valueContract.addLLC.sendTransaction(
      lockContract.address,
      loanRate,
      feeRate
    );
  }
};