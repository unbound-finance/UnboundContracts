const uDai = artifacts.require("UnboundDollar");
const valuer = artifacts.require("Valuing_01");
const LLC = artifacts.require("LLC_EthDai");

const uniFactory = artifacts.require("UniswapV2Factory");
const testDai = artifacts.require("TestDai");
const testEth = artifacts.require("TestEth");

const loanRate = 500000;
const feeRate = 5000;
let stablecoinAddress = ""; // Stablecoin-ADDRESS
let UndAddress = ""; // UND-Token-ADDRESS
let valuerAddress = ""; // Valuer-ADDRESS
let LPTAddress = ""; // Liquidity-Pool-Token-ADDRESS

module.exports = async (deployer, network, accounts) => {
  if (LPTAddress === "") {
    const factory = await uniFactory.deployed();
    const pair = await factory.createPair.sendTransaction(testDai.address, testEth.address);
    LPTAddress = pair.logs[0].args.pair;
  }

  stablecoinAddress = stablecoinAddress || testDai.address;
  const undContract = UndAddress === "" ? await uDai.deployed() : await uDai.at(UndAddress);
  const valueContract = valuerAddress === "" ? await valuer.deployed() : await valuer.at(valuerAddress);

  await deployer.deploy(LLC, valueContract.address, LPTAddress, stablecoinAddress, undContract.address);

  await valueContract.addLLC.sendTransaction(LLC.address, loanRate, feeRate);
  await valueContract.allowToken.sendTransaction(undContract.address);
  await undContract.changeValuator.sendTransaction(valueContract.address);
};
