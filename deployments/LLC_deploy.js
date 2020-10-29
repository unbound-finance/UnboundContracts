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

const uTokenAddr = "!!!! ENTER UTOKEN ADDRESS HERE !!!!"

const LPTAddress = "!!!!ENTER ADDRESS HERE!!!!";

const stableCoin = "!!!!ENTER STABLECOIN ADDRESS HERE!!!!";

const valueAddress = "!!!!ENTER VALUING ADDRESS HERE!!!!";

const loanRate = "ENTER DESIRED LOAN RATE";

const feeRate = "ENTER DESIRED FEE RATE"

// Deploys UND and 
module.exports = async (deployer, network, accounts) => {

  const lockContract = await deployer.deploy(LLC, valueAddress, LPTAddress, stableCoin, uTokenAddr);
  
  const valueContract = valuing.at(valueAddress);

  await valueContract.addLLC.sendTransaction(
    lockContract.address,
    loanRate,
    feeRate
  );
  
  
  console.log(lockContract.address);
};