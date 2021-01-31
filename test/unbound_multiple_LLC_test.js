/* eslint-disable no-undef */
/*
 * OpenZeppelin Test Helpers
 * https://github.com/OpenZeppelin/openzeppelin-test-helpers
 */
const { BN, constants, balance, expectEvent, expectRevert } = require("@openzeppelin/test-helpers");

/*
 *  ========================================================
 *  Tests of public & external functions in Tier1a contract
 *  ========================================================
 */
const UND = artifacts.require("UnboundDollar");
const valuing = artifacts.require("Valuing_01");
const llcEth = artifacts.require("LLC_EthDai");
const llcLink = artifacts.require("LLC_LinkDai");
const testDai = artifacts.require("TestDai");
const testEth = artifacts.require("TestEth");
const testLink = artifacts.require("TestLink");
const uniFactory = artifacts.require("UniswapV2Factory");
const uniPair = artifacts.require("UniswapV2Pair");
const router = artifacts.require("UniswapV2Router02");
const testAggregatorEth = artifacts.require("TestAggregatorProxyEthUsd");
const testAggregatorLink = artifacts.require("TestAggregatorProxyLinkUsd");
const testAggregatorDai = artifacts.require("TestAggregatorProxyDaiUsd");

contract("unboundSystem multiple LLC", function (_accounts) {
  // Initial settings
  const totalSupply = 0;
  const decimal = 10 ** 18;
  const owner = _accounts[0];
  const safu = _accounts[1];
  const devFund = _accounts[2];
  const user = _accounts[3];
  const daiAmount = 400000;
  const rateBalance = 10 ** 6;
  const rates = {
    eth: { loanRate: 500000, feeRate: 5000 },
    link: { loanRate: 600000, feeRate: 4000 },
  };
  const stakeSharesPercent = 50;
  const safuSharesPercent = 50;
  const CREnd = 20000;
  const CRNorm = 10000;
  const blockLimit = 10;
  const ethPrice = 128093000000;
  const daiPrice = 100275167;
  const linkPrice = 2311033776;

  let und;
  let valueContract;
  let lockContractEth;
  let lockContractLink;
  let tDai;
  let tEth;
  let tLink;
  let factory;
  let pairEthDai;
  let pairLinkDai;
  let route;
  let storedFee = 0;
  let stakePair;
  let lastBlockEth;
  let lastBlockLink;

  before(async function () {
    tEth = await testEth.deployed();
    tLink = await testLink.deployed();
    tDai = await testDai.deployed();
    route = await router.deployed();
    und = await UND.deployed();
    valueContract = await valuing.deployed();
    lockContractEth = await llcEth.deployed();
    lockContractLink = await llcLink.deployed();
    factory = await uniFactory.deployed();
    pairEthDai = await uniPair.at(await lockContractEth.pair());
    pairLinkDai = await uniPair.at(await lockContractLink.pair());
    priceFeedEth = await testAggregatorEth.deployed();
    priceFeedLink = await testAggregatorLink.deployed();
    priceFeedDai = await testAggregatorDai.deployed();

    // Set price to aggregator
    await priceFeedEth.setPrice(ethPrice);
    await priceFeedLink.setPrice(linkPrice);
    await priceFeedDai.setPrice(daiPrice);

    let stakePool = await factory.createPair(tDai.address, und.address);
    stakePair = await uniPair.at(stakePool.logs[0].args.pair);
    await und.changeStaking(stakePair.address);

    // Ethereum
    await tDai.approve(route.address, daiAmount);
    await tEth.approve(route.address, parseInt((daiAmount * daiPrice) / ethPrice));
    let d = new Date();
    let time = d.getTime();
    await route.addLiquidity(
      tDai.address,
      tEth.address,
      daiAmount,
      parseInt((daiAmount * daiPrice) / ethPrice),
      3000,
      10,
      owner,
      parseInt(time / 1000 + 100)
    );

    // Link
    await tDai.approve(route.address, daiAmount);
    await tLink.approve(route.address, parseInt((daiAmount * daiPrice) / linkPrice));
    await route.addLiquidity(
      tDai.address,
      tLink.address,
      daiAmount,
      parseInt((daiAmount * daiPrice) / linkPrice),
      3000,
      10,
      owner,
      parseInt(time / 1000 + 100)
    );
  });

  //=================
  // Default Functionality
  //=================
  describe("Check default functionality", () => {
    it("UND mint - EthDai first", async () => {
      const lptBalanceBefore = parseInt(await pairEthDai.balanceOf(owner));
      const LPtokens = parseInt(lptBalanceBefore / 4); // Amount of token to be lock
      const lockedTokenBefore = parseInt(await lockContractEth.tokensLocked(owner));
      const undBalanceBefore = parseInt(await und.balanceOf(owner));
      const stakingBalanceBefore = parseInt(await und.balanceOf(stakePair.address));
      const LPTbal = parseInt(await pairEthDai.balanceOf(owner));
      const { loanAmount, feeAmount, stakingAmount } = await getAmounts(daiAmount, pairEthDai, LPtokens, rates.eth);

      await pairEthDai.approve(lockContractEth.address, LPtokens);
      const receipt = await lockContractEth.lockLPT(LPtokens, loanAmount - feeAmount);
      expectEvent.inTransaction(receipt.tx, und, "Mint", {
        user: owner,
        newMint: loanAmount.toString(),
      });
      const block = await web3.eth.getBlock("latest");
      lastBlockEth = block.number;

      const lptBalanceAfter = parseInt(await pairEthDai.balanceOf(owner));
      const lockedTokenAfter = parseInt(await lockContractEth.tokensLocked(owner));
      const undBalanceAfter = parseInt(await und.balanceOf(owner));
      const stakingBalanceAfter = parseInt(await und.balanceOf(stakePair.address));
      const loanedAmount = await und.checkLoan(owner, lockContractEth.address);

      assert.equal(lptBalanceAfter, lptBalanceBefore - LPtokens, "pool balance incorrect");
      assert.equal(lockedTokenAfter, lockedTokenBefore + LPtokens, "locked token incorrect");
      assert.equal(undBalanceAfter, undBalanceBefore + loanAmount - feeAmount, "owner balance incorrect");
      assert.equal(stakingBalanceAfter, stakingBalanceBefore + stakingAmount, "staking balance incorrect");
      assert.equal(loanedAmount, loanAmount, "loaned amount incorrect");
      storedFee += feeAmount - stakingAmount;

      console.log(`LLC-Eth.locked: ${await pairEthDai.balanceOf(lockContractEth.address)}`);
      console.log(`LLC-Link.locked: ${await pairLinkDai.balanceOf(lockContractLink.address)}`);
      console.log(`UND.balance: ${undBalanceAfter}`);
    });

    it("UND mint - LinkDai first", async () => {
      const lptBalanceBefore = parseInt(await pairLinkDai.balanceOf(owner));
      const LPtokens = parseInt(lptBalanceBefore / 4); // Amount of token to be lock
      const lockedTokenBefore = parseInt(await lockContractLink.tokensLocked(owner));
      const undBalanceBefore = parseInt(await und.balanceOf(owner));
      const stakingBalanceBefore = parseInt(await und.balanceOf(stakePair.address));
      const { loanAmount, feeAmount, stakingAmount } = await getAmounts(daiAmount, pairLinkDai, LPtokens, rates.link);

      await pairLinkDai.approve(lockContractLink.address, LPtokens);
      const receipt = await lockContractLink.lockLPT(LPtokens, loanAmount - feeAmount);
      expectEvent.inTransaction(receipt.tx, und, "Mint", {
        user: owner,
        newMint: loanAmount.toString(),
      });
      const block = await web3.eth.getBlock("latest");
      lastBlockLink = block.number;

      const lptBalanceAfter = parseInt(await pairLinkDai.balanceOf(owner));
      const lockedTokenAfter = parseInt(await lockContractLink.tokensLocked(owner));
      const undBalanceAfter = parseInt(await und.balanceOf(owner));
      const stakingBalanceAfter = parseInt(await und.balanceOf(stakePair.address));
      const loanedAmount = parseInt(await und.checkLoan(owner, lockContractLink.address));

      assert.equal(lptBalanceAfter, lptBalanceBefore - LPtokens, "pool balance incorrect");
      assert.equal(lockedTokenAfter, lockedTokenBefore + LPtokens, "locked token incorrect");
      assert.equal(undBalanceAfter, undBalanceBefore + loanAmount - feeAmount, "owner balance incorrect");
      assert.equal(stakingBalanceAfter, stakingBalanceBefore + stakingAmount, "staking balance incorrect");
      assert.equal(loanedAmount, loanAmount, "loaned amount incorrect");
      storedFee += feeAmount - stakingAmount;

      console.log(`LLC-Eth.locked: ${await pairEthDai.balanceOf(lockContractEth.address)}`);
      console.log(`LLC-Link.locked: ${await pairLinkDai.balanceOf(lockContractLink.address)}`);
      console.log(`UND.balance: ${undBalanceAfter}`);
    });

    async function getAmounts(daiAmount, pair, LPtokens, rates) {
      const totalUSD = daiAmount * 2; // Total value in Liquidity pool
      const totalLPTokens = parseInt(await pair.totalSupply()); // Total token amount of Liq pool
      const LPTValueInDai = parseInt((totalUSD * LPtokens) / totalLPTokens); //% value of Liq pool in Dai
      const loanAmount = parseInt((LPTValueInDai * rates.loanRate) / rateBalance); // Loan amount that user can get
      const feeAmount = parseInt((loanAmount * rates.feeRate) / rateBalance); // Amount of fee
      const stakingAmount = 0;
      return { loanAmount, feeAmount, stakingAmount };
    }

    it("UND burn - EthDai", async () => {
      const lptBalanceBefore = parseInt(await pairEthDai.balanceOf(owner));
      const lockedTokenAmount = parseInt(await lockContractEth.tokensLocked(owner));
      const undBalanceBefore = parseInt(await und.balanceOf(owner));
      const mintedUND = parseInt(await und.checkLoan(owner, lockContractEth.address));

      // burn
      await waitBlock(lastBlockEth);
      const receipt = await lockContractEth.unlockLPT(mintedUND);
      expectEvent.inTransaction(receipt.tx, und, "Burn", {
        user: owner,
        burned: mintedUND.toString(),
      });

      const lptBalanceAfter = parseInt(await pairEthDai.balanceOf(owner));
      const lockedTokenAfter = parseInt(await lockContractEth.tokensLocked(owner));
      const undBalanceAfter = parseInt(await und.balanceOf(owner));

      assert.equal(lptBalanceAfter, lptBalanceBefore + lockedTokenAmount, "pool balance incorrect");
      assert.equal(lockedTokenAfter, 0, "locked token incorrect");
      assert.equal(undBalanceAfter, undBalanceBefore - mintedUND, "owner balance incorrect");

      console.log(`LLC-Eth.locked: ${await pairEthDai.balanceOf(lockContractEth.address)}`);
      console.log(`LLC-Link.locked: ${await pairLinkDai.balanceOf(lockContractLink.address)}`);
      console.log(`UND.balance: ${undBalanceAfter}`);
    });

    it("cannot unlock with less than necessary amount of UND", async () => {
      // const lockedTokenAmount = parseInt(await lockContractLink.tokensLocked(owner));
      const mintedUND = parseInt(await und.checkLoan(owner, lockContractLink.address));

      // burn
      await expectRevert(lockContractLink.unlockLPT(mintedUND), "Insufficient UND to pay back loan");
    });

    it("UND burn - LinkDai", async () => {
      const lptBalanceBefore = parseInt(await pairLinkDai.balanceOf(owner));
      const lockedTokenAmount = parseInt(await lockContractLink.tokensLocked(owner));
      const undBalanceBefore = parseInt(await und.balanceOf(owner));
      const mintedUND = parseInt(await und.checkLoan(owner, lockContractLink.address));
      const burnAmountUND = mintedUND / 2;
      // const unlockAmountLPT = lockedTokenAmount - ((mintedUND - burnAmountUND) * CREnd) / CRNorm / priceLPT;
      const unlockAmountLPT = parseInt((lockedTokenAmount * burnAmountUND) / mintedUND);

      // burn
      await waitBlock(lastBlockLink);
      const receipt = await lockContractLink.unlockLPT(burnAmountUND);
      expectEvent.inTransaction(receipt.tx, und, "Burn", {
        user: owner,
        burned: burnAmountUND.toString(),
      });

      const lptBalanceAfter = parseInt(await pairLinkDai.balanceOf(owner));
      const lockedTokenAmountAfter = parseInt(await lockContractLink.tokensLocked(owner));
      const undBalanceAfter = parseInt(await und.balanceOf(owner));

      assert.equal(lptBalanceAfter, lptBalanceBefore + unlockAmountLPT, "pool balance incorrect");
      assert.equal(lockedTokenAmountAfter, lockedTokenAmount - unlockAmountLPT, "locked token incorrect");
      assert.equal(undBalanceAfter, undBalanceBefore - burnAmountUND, "owner balance incorrect");

      console.log(`LLC-Eth.locked: ${await pairEthDai.balanceOf(lockContractEth.address)}`);
      console.log(`LLC-Link.locked: ${await pairLinkDai.balanceOf(lockContractLink.address)}`);
      console.log(`UND.balance: ${undBalanceAfter}`);
    });
  });

  async function waitBlock(lastBlock) {
    let latestBlock;
    do {
      await tDai._mint(owner, 1);
      const block = await web3.eth.getBlock("latest");
      latestBlock = block.number;
    } while (lastBlock + blockLimit > latestBlock);
  }
});
