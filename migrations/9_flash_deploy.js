const BigNumber = require('bignumber.js');

const attack1 = artifacts.require("pseudoFlashloanAttack1");
const attack2 = artifacts.require("pseudoFlashloanAttack2");

const router = artifacts.require("UniswapV2Router02");
const uniFactory = artifacts.require('UniswapV2Factory');
const uniPair = artifacts.require("UniswapV2Pair");

const uDai = artifacts.require("UnboundDollar");
const valuer = artifacts.require("Valuing_01");
const LLC = artifacts.require("LLC_EthDai");

const usdc = artifacts.require("TestUSDC");
const dai = artifacts.require("TestEth");
const weth = artifacts.require("WETH9");

// const undAddress = "0xa729D5cA5BcE0d275B69728881f5bB86511EA70B"

// const usdcAddress = "0xFB841B3f7a33999692e498Cac36D358632de93e8";

// const daiAddress = "0x9CD539Ac8Dca5757efAc30Cd32da20CD955e0f8B";

// const routerAddress = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

// const LLCAddress = "0x8eDe4b5897f484d0b0fB832a0eDC7D08A942DdA8";

// const usdcDaiPoolAddress = "0xb0a2a806ec900bb9fe30bd7f6cadd35d74971542";

const owner = "0x751D87CB75b4caf08902177ab31a2d8431a07A59";
const testAddr = "0xd17BCe6b5BEb015f399c4C20024B76e82e85Fe60";
const loanReceiver = "0xbAC374b151AD65875cA7fDD900AdA25373A3D5Ce";

/// und:usdc = 0x38c29e725ba3f1168b43dc689d2f5f30d249fa8c

// Deploys UND and 
module.exports = async (deployer, network, accounts) => {

  // deploy UND and valuing
  await deployer.deploy(uDai, "unbound", "und", testAddr, testAddr);
  const UND = await uDai.deployed();
  await deployer.deploy(valuer, UND.address);
  const valuing = await valuer.deployed();
  
  // link UND to valuing
  await UND.changeValuator.sendTransaction(
    valuing.address
  );
  await valuing.allowToken.sendTransaction(
    UND.address
  );

  // deploy testUSDC and testDAI
  await deployer.deploy(usdc, testAddr);
  const USDC = await usdc.deployed();
  await deployer.deploy(dai, testAddr);
  const DAI = await dai.deployed();

  // deploy factory, WETH and router
  await deployer.deploy(uniFactory, testAddr);
  const factory = await uniFactory.deployed();

  await deployer.deploy(weth);
  const WETH = await weth.deployed();

  await deployer.deploy(router, factory.address, WETH.address);
  const uniRouter = await router.deployed();

  // create USDC/DAI LP pool
  const pairAddr = await factory.createPair.sendTransaction(USDC.address, DAI.address);
  console.log(pairAddr.receipt.logs[0].args.pair);
  

  // add initial liquidity of 1M USDC and 1M DAI
  let d = new Date();
  let time = d.getTime();
  let usdcMil = new BigNumber(1000000 * (10 ** 6));
  let daiMil = new BigNumber(1000000 * (10 ** 18));

  await USDC.approve.sendTransaction(uniRouter.address, usdcMil);
  await DAI.approve.sendTransaction(uniRouter.address, daiMil);
  await uniRouter.addLiquidity.sendTransaction(
    USDC.address, 
    DAI.address, 
    usdcMil,
    daiMil,
    usdcMil,
    daiMil,
    owner,
    parseInt(time + 1000)
  );

  // deploy LLC
  await deployer.deploy(LLC, valuing.address, pairAddr.receipt.logs[0].args.pair, USDC.address, UND.address, 20);
  const newLLC = await LLC.deployed();

  // allow LLC in valuator
  await valuing.addLLC.sendTransaction(newLLC.address, 75, 2500);

  // mint some UND
  const LPPool = await uniPair.at(pairAddr.receipt.logs[0].args.pair);
  let poolTokens = await LPPool.balanceOf(owner);
  console.log(poolTokens.toString());
  await LPPool.approve.sendTransaction(newLLC.address, poolTokens);
  await newLLC.lockLPT.sendTransaction(poolTokens, 100);

  // create UND/USDC pool
  const undPool = await factory.createPair.sendTransaction(UND.address, USDC.address);
  
  // add UND/USDC liquidity
  let UNDtokenBal = await UND.balanceOf(owner);
  await UND.approve.sendTransaction(uniRouter.address, UNDtokenBal);
  await USDC.approve.sendTransaction(uniRouter.address, usdcMil); // This number can be adjusted
  await uniRouter.addLiquidity.sendTransaction(
    UND.address,
    USDC.address,
    UNDtokenBal,
    usdcMil,
    UNDtokenBal,
    usdcMil,
    owner,
    parseInt(time + 1000)
  );
  console.log(UNDtokenBal.toString());

  // deploy Attack1
  await deployer.deploy(attack1, [UND.address, USDC.address, DAI.address, uniRouter.address, newLLC.address, pairAddr.receipt.logs[0].args.pair]);
  const attackContract = await attack1.deployed();

  // Give Attack1 2M USDC loan
  let twoMil = new BigNumber(2000000 * (10 ** 6));
  USDC.transfer.sendTransaction(attackContract.address, twoMil);

  // Initiate flashLoan attack
  await attackContract.flashLoanAttack.sendTransaction(loanReceiver);

  // const attack2Contract = await deployer.deploy(attack2, [undAddress, usdcAddress, daiAddress, routerAddress, LLCAddress, usdcDaiPoolAddress]);

  
};