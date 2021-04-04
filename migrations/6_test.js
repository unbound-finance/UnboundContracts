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

const Oracle = artifacts.require("UniswapV2PriceProvider");
// const feeSplitter = artifacts.require("feeSplitter");
// const LPTstake = artifacts.require("unboundStaking");

// const priceFeedAddress = "!!!! ENTER Price Feed ADDRESS HERE !!!!"

const LPTAddresses = [
  {
    LPAddress: "0x54870f44414e69af7eb2f3e1e144ebb7c79325b7",
    oracleAddress: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    isPeggedToUSD: ["false", "true"],
    decimals: [18, 18],
    stablecoin: "0x9CD539Ac8Dca5757efAc30Cd32da20CD955e0f8B"
  },
]; // enter LP addresses here

// const baseAssetFeed = "!!!!ENTER Base Asset Feed ADDRESS HERE!!!!";

// const valueAddress = "!!!!ENTER VALUING ADDRESS HERE!!!!";

const loanRate = "500000";

const feeRate = "6000";

// Deploys UND and
module.exports = async (deployer, network, accounts) => {
  const safuAddr = "0x605a416Ce8B75B6e8872E98F347Ff9Ca00Df045b";
  const devFundAddr = "0x605a416Ce8B75B6e8872E98F347Ff9Ca00Df045b";

  await deployer.deploy(uDai, "Unbound Dollar", "UND", safuAddr, devFundAddr);
  const UND = await uDai.deployed();

  await deployer.deploy(valuing);
  const valueContract = await valuing.deployed();

  await UND.changeValuator(valueContract.address);

  for (let i = 0; i < LPTAddresses.length; i++) {

    const oracle = await deployer.deploy(
      Oracle,
      LPTAddresses[i].LPAddress,
      LPTAddresses[i].decimals,
      LPTAddresses[i].oracleAddress,
      "500000000000000000",
      500,
      LPTAddresses[i].stablecoin,
    );

    await deployer.deploy(
      LLC,
      valueContract.address,
      LPTAddresses[i].LPAddress,
      UND.address,
      oracle.address
    );
    const lockContract = await LLC.deployed();
    await valueContract.addLLC.sendTransaction(lockContract.address, UND.address, loanRate, feeRate);
  }
};
