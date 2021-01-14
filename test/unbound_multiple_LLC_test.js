/* eslint-disable no-undef */
/*
 * OpenZeppelin Test Helpers
 * https://github.com/OpenZeppelin/openzeppelin-test-helpers
 */
const { BN, constants, balance, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

/*
 *  ========================================================
 *  Tests of public & external functions in Tier1a contract
 *  ========================================================
 */
const UND = artifacts.require('UnboundDollar');
const valuing = artifacts.require('Valuing_01');
const llcEth = artifacts.require('LLC_EthDai');
const llcLink = artifacts.require('LLC_LinkDai');
const testDai = artifacts.require('TestDai');
const testEth = artifacts.require('TestEth');
const testLink = artifacts.require('TestLink');
const uniFactory = artifacts.require('UniswapV2Factory');
const uniPair = artifacts.require('UniswapV2Pair');
const router = artifacts.require('UniswapV2Router02');
const testAggregatorEth = artifacts.require('TestAggregatorProxyEth');
const testAggregatorLink = artifacts.require('TestAggregatorProxyLink');
const testAggregatorDai = artifacts.require('TestAggregatorProxyDai');

contract('unboundSystem multiple LLC', function (_accounts) {
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
    await priceFeedEth.setPrice(40000000000);
    await priceFeedLink.setPrice(40000000000);
    await priceFeedDai.setPrice(100000000);

    let stakePool = await factory.createPair(tDai.address, und.address);
    stakePair = await uniPair.at(stakePool.logs[0].args.pair);
    await und.changeStaking(stakePair.address);

    // Ethereum
    await tDai.approve(route.address, daiAmount);
    await tEth.approve(route.address, 1000);
    let d = new Date();
    let time = d.getTime();
    await route.addLiquidity(tDai.address, tEth.address, daiAmount, 1000, 3000, 10, owner, parseInt(time / 1000 + 100));

    // Link
    await tDai.approve(route.address, daiAmount);
    await tLink.approve(route.address, 1000);
    await route.addLiquidity(
      tDai.address,
      tLink.address,
      daiAmount,
      1000,
      3000,
      10,
      owner,
      parseInt(time / 1000 + 100)
    );
  });

  //=================
  // Default Functionality
  //=================
  describe('Check default functionality', () => {
    it('UND mint - EthDai first', async () => {
      const lptBalanceBefore = parseInt(await pairEthDai.balanceOf(owner));
      const LPtokens = parseInt(lptBalanceBefore / 4); // Amount of token to be lock
      const lockedTokenBefore = parseInt(await lockContractEth.tokensLocked(owner));
      const undBalanceBefore = parseInt(await und.balanceOf(owner));
      const stakingBalanceBefore = parseInt(await und.balanceOf(stakePair.address));
      const LPTbal = parseInt(await pairEthDai.balanceOf(owner));
      const { loanAmount, feeAmount, stakingAmount } = await getAmounts(daiAmount, pairEthDai, LPtokens, rates.eth);

      await pairEthDai.approve(lockContractEth.address, LPtokens);
      const receipt = await lockContractEth.lockLPT(LPtokens, loanAmount - feeAmount);
      expectEvent.inTransaction(receipt.tx, und, 'Mint', {
        user: owner,
        newMint: loanAmount.toString(),
      });

      const lptBalanceAfter = parseInt(await pairEthDai.balanceOf(owner));
      const lockedTokenAfter = parseInt(await lockContractEth.tokensLocked(owner));
      const undBalanceAfter = parseInt(await und.balanceOf(owner));
      const stakingBalanceAfter = parseInt(await und.balanceOf(stakePair.address));
      const loanedAmount = await und.checkLoan(owner, lockContractEth.address);

      assert.equal(lptBalanceAfter, lptBalanceBefore - LPtokens, 'pool balance incorrect');
      assert.equal(lockedTokenAfter, lockedTokenBefore + LPtokens, 'locked token incorrect');
      assert.equal(undBalanceAfter, undBalanceBefore + loanAmount - feeAmount, 'owner balance incorrect');
      assert.equal(stakingBalanceAfter, stakingBalanceBefore + stakingAmount, 'staking balance incorrect');
      assert.equal(loanedAmount, loanAmount, 'loaned amount incorrect');
      storedFee += feeAmount - stakingAmount;

      console.log(`LLC-Eth.locked: ${await pairEthDai.balanceOf(lockContractEth.address)}`);
      console.log(`LLC-Link.locked: ${await pairLinkDai.balanceOf(lockContractLink.address)}`);
      console.log(`UND.balance: ${undBalanceAfter}`);
    });

    it('UND mint - LinkDai first', async () => {
      const lptBalanceBefore = parseInt(await pairLinkDai.balanceOf(owner));
      const LPtokens = parseInt(lptBalanceBefore / 4); // Amount of token to be lock
      const lockedTokenBefore = parseInt(await lockContractLink.tokensLocked(owner));
      const undBalanceBefore = parseInt(await und.balanceOf(owner));
      const stakingBalanceBefore = parseInt(await und.balanceOf(stakePair.address));
      const { loanAmount, feeAmount, stakingAmount } = await getAmounts(daiAmount, pairLinkDai, LPtokens, rates.link);

      await pairLinkDai.approve(lockContractLink.address, LPtokens);
      const receipt = await lockContractLink.lockLPT(LPtokens, loanAmount - feeAmount);
      expectEvent.inTransaction(receipt.tx, und, 'Mint', {
        user: owner,
        newMint: loanAmount.toString(),
      });

      const lptBalanceAfter = parseInt(await pairLinkDai.balanceOf(owner));
      const lockedTokenAfter = parseInt(await lockContractLink.tokensLocked(owner));
      const undBalanceAfter = parseInt(await und.balanceOf(owner));
      const stakingBalanceAfter = parseInt(await und.balanceOf(stakePair.address));
      const loanedAmount = parseInt(await und.checkLoan(owner, lockContractLink.address));

      assert.equal(lptBalanceAfter, lptBalanceBefore - LPtokens, 'pool balance incorrect');
      assert.equal(lockedTokenAfter, lockedTokenBefore + LPtokens, 'locked token incorrect');
      assert.equal(undBalanceAfter, undBalanceBefore + loanAmount - feeAmount, 'owner balance incorrect');
      assert.equal(stakingBalanceAfter, stakingBalanceBefore + stakingAmount, 'staking balance incorrect');
      assert.equal(loanedAmount, loanAmount, 'loaned amount incorrect');
      storedFee += feeAmount - stakingAmount;

      console.log(`LLC-Eth.locked: ${await pairEthDai.balanceOf(lockContractEth.address)}`);
      console.log(`LLC-Link.locked: ${await pairLinkDai.balanceOf(lockContractLink.address)}`);
      console.log(`UND.balance: ${undBalanceAfter}`);
    });

    async function getAmounts(daiAmount, pair, LPtokens, rates) {
      const totalUSD = daiAmount * 2; // Total value in Liquidity pool
      const totalLPTokens = parseInt(await pairEthDai.totalSupply()); // Total token amount of Liq pool
      const LPTValueInDai = parseInt((totalUSD * LPtokens) / totalLPTokens); //% value of Liq pool in Dai
      const loanAmount = parseInt((LPTValueInDai * rates.loanRate) / rateBalance); // Loan amount that user can get
      const feeAmount = parseInt((loanAmount * rates.feeRate) / rateBalance); // Amount of fee
      const stakingAmount = 0;
      return { loanAmount, feeAmount, stakingAmount };
    }

    it('UND burn - EthDai', async () => {
      const lptBalanceBefore = parseInt(await pairEthDai.balanceOf(owner));
      const lockedTokenAmount = parseInt(await lockContractEth.tokensLocked(owner));
      const undBalanceBefore = parseInt(await und.balanceOf(owner));
      const mintedUND = parseInt(await und.checkLoan(owner, lockContractEth.address));

      // burn
      const receipt = await lockContractEth.unlockLPT(mintedUND);
      expectEvent.inTransaction(receipt.tx, und, 'Burn', {
        user: owner,
        burned: mintedUND.toString(),
      });

      const lptBalanceAfter = parseInt(await pairEthDai.balanceOf(owner));
      const lockedTokenAfter = parseInt(await lockContractEth.tokensLocked(owner));
      const undBalanceAfter = parseInt(await und.balanceOf(owner));

      assert.equal(lptBalanceAfter, lptBalanceBefore + lockedTokenAmount, 'pool balance incorrect');
      assert.equal(lockedTokenAfter, 0, 'locked token incorrect');
      assert.equal(undBalanceAfter, undBalanceBefore - mintedUND, 'owner balance incorrect');

      console.log(`LLC-Eth.locked: ${await pairEthDai.balanceOf(lockContractEth.address)}`);
      console.log(`LLC-Link.locked: ${await pairLinkDai.balanceOf(lockContractLink.address)}`);
      console.log(`UND.balance: ${undBalanceAfter}`);
    });

    it('cannot unlock with less than necessary amount of UND', async () => {
      // const lockedTokenAmount = parseInt(await lockContractLink.tokensLocked(owner));
      const mintedUND = parseInt(await und.checkLoan(owner, lockContractLink.address));

      // burn
      await expectRevert(lockContractLink.unlockLPT(mintedUND), 'Insufficient UND to pay back loan');
    });

    it('UND burn - LinkDai', async () => {
      const priceLPT = 40;
      const lptBalanceBefore = parseInt(await pairLinkDai.balanceOf(owner));
      const lockedTokenAmount = parseInt(await lockContractLink.tokensLocked(owner));
      const undBalanceBefore = parseInt(await und.balanceOf(owner));
      const mintedUND = parseInt(await und.checkLoan(owner, lockContractLink.address));
      const burnAmountUND = mintedUND / 2;
      const unlockAmountLPT = lockedTokenAmount - ((mintedUND - burnAmountUND) * CREnd) / CRNorm / priceLPT;

      // burn
      const receipt = await lockContractLink.unlockLPT(burnAmountUND);
      expectEvent.inTransaction(receipt.tx, und, 'Burn', {
        user: owner,
        burned: burnAmountUND.toString(),
      });

      const lptBalanceAfter = parseInt(await pairLinkDai.balanceOf(owner));
      const lockedTokenAmountAfter = parseInt(await lockContractLink.tokensLocked(owner));
      const undBalanceAfter = parseInt(await und.balanceOf(owner));

      assert.equal(lptBalanceAfter, lptBalanceBefore + unlockAmountLPT, 'pool balance incorrect');
      assert.equal(lockedTokenAmountAfter, lockedTokenAmount - unlockAmountLPT, 'locked token incorrect');
      assert.equal(undBalanceAfter, undBalanceBefore - burnAmountUND, 'owner balance incorrect');

      console.log(`LLC-Eth.locked: ${await pairEthDai.balanceOf(lockContractEth.address)}`);
      console.log(`LLC-Link.locked: ${await pairLinkDai.balanceOf(lockContractLink.address)}`);
      console.log(`UND.balance: ${undBalanceAfter}`);
    });
  });
});
