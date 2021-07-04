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

const loanRate = 300000;
const feeRate = 6000;
const stablecoinAddress = "0x9EC76597061cA31b3E3EBB2a2Af991092808566b"; // Stablecoin-ADDRESS
const tokenAddress = "0x5cf4CfAfe9eF13B96cD6c8de1723595653Af4b64"
let UndAddress = "0xD844CE718a4223f4df4389Ffd01B1D6340656b34"; // UND-Token-ADDRESS
let valuerAddress = "0xC69bA6a4b3c9dB45aB8B11F2eD0d761f94fA1517"; // Valuer-ADDRESS
let LPTAddress = ""; // Liquidity-Pool-Token-ADDRESS
let priceFeedAddress = "";
let baseAssetFeed = "";
// let factoryAddress = "0x22e18D791EeE1EE7Eda4c7d6a9D435A8CA10Cf78";
let v2pair;

module.exports = async (deployer, network, accounts) => {
  if (LPTAddress === "") {
      console.log("pair")
    const factory = await uniFactory.at("0x815F8BC98fea8Dff8bcBB00487e488bBbfBA32FC");
    console.log("comp")
    const DAI = await testDai.at("0x3699f90CC399ed9C4c773A6e291aD7d51de89a83");
    const ETH = await testEth.at("0x579C569c931AAA523e43C2995b5DAAFb859B5E8B");
    const pair = await factory.createPair(DAI.address, ETH.address);
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

//   stablecoinAddress = stablecoinAddress || testDai.address;
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
