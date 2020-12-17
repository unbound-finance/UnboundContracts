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
const uDai = artifacts.require('UnboundDollar');
const valuing = artifacts.require('Valuing_01');
const LLC = artifacts.require('LLC_EthDai');
const testDai = artifacts.require('TestDai');
const testEth = artifacts.require('TestEth');
const uniFactory = artifacts.require('UniswapV2Factory');
const uniPair = artifacts.require('UniswapV2Pair');
const weth9 = artifacts.require('WETH9');
const router = artifacts.require('UniswapV2Router02');

contract('Scenario', function (_accounts) {
  // Initial settings
  const totalSupply = 0;
  const decimal = 10 ** 18;
  const owner = _accounts[0];
  const safu = _accounts[1];
  const devFund = _accounts[2];
  const user = _accounts[3];
  const daiAmount = 400000;
  const rateBalance = 10 ** 6;
  const loanRate = 500000;
  const feeRate = 5000;
  const stakeSharesPercent = 50;
  const safuSharesPercent = 50;

  let und;
  let valueContract;
  let lockContract;
  let tDai;
  let tEth;
  let factory;
  let pair;
  let route;
  let burnTokens;
  let storedFeeTotal = 0;
  let stakePair;

  //=================
  // Default Functionality
  //=================
  describe('Lock and burn LPT scenario', () => {
    before(async () => {
      tEth = await testEth.deployed();
      tDai = await testDai.deployed();
      route = await router.deployed();
      und = await uDai.deployed();
      valueContract = await valuing.deployed();
      lockContract = await LLC.deployed();
      factory = await uniFactory.deployed();
      pair = await uniPair.at(await lockContract.pair());
      await tDai.approve(route.address, 400000);
      await tEth.approve(route.address, 1000);
      let d = new Date();
      let time = d.getTime();
      await route.addLiquidity(
        tDai.address,
        tEth.address,
        daiAmount,
        1000,
        3000,
        10,
        owner,
        parseInt(time / 1000 + 100)
      );
      let stakePool = await factory.createPair(tDai.address, und.address);
      stakePair = await uniPair.at(stakePool.logs[0].args.pair);
      await und.changeStaking(stakePair.address);
    });

    it('Lock LPT - first(not auto fee distribution)', async () => {
      const LPTbal = parseInt(await pair.balanceOf(owner));
      const LPtokens = parseInt(LPTbal / 4); // Amount of token to be lock
      burnTokens = LPtokens;

      const totalUSD = daiAmount * 2; // Total value in Liquidity pool
      const totalLPTokens = parseInt(await pair.totalSupply()); // Total token amount of Liq pool
      const LPTValueInDai = parseInt((totalUSD * LPtokens) / totalLPTokens); //% value of Liq pool in Dai
      const loanAmount = parseInt((LPTValueInDai * loanRate) / rateBalance); // Loan amount that user can get
      const feeAmount = parseInt((loanAmount * feeRate) / rateBalance); // Amount of fee
      const stakingAmount = 0;

      await pair.approve(lockContract.address, LPtokens);
      const receipt = await lockContract.lockLPT(LPtokens, loanAmount - feeAmount);
      expectEvent(receipt, 'LockLPT', {
        LPTamt: LPtokens.toString(),
        user: owner,
      });
      expectEvent.inTransaction(receipt.tx, und, 'Mint', {
        user: owner,
        newMint: loanAmount.toString(),
      });

      const ownerBal = parseInt(await und.balanceOf(owner));
      const stakingBal = parseInt(await und.balanceOf(stakePair.address));
      const loanedAmount = await und.checkLoan(owner, lockContract.address);

      assert.equal(ownerBal, loanAmount - feeAmount, 'owner balance incorrect');
      assert.equal(stakingBal, stakingAmount, 'staking balance incorrect');
      assert.equal(loanedAmount, loanAmount, 'loaned amount incorrect');
      storedFeeTotal += feeAmount - stakingAmount;
    });

    // it('UND should be able to change autoFeeDistribution', async () => {
    //   const beforeStoredFee = parseInt(await und.storedFee());
    //   assert.equal(beforeStoredFee, storedFeeTotal, 'incorrect before stored fee');

    //   const beforeStakingBal = parseInt(await und.balanceOf(stakePair.address));
    //   const beforeSafuBal = parseInt(await und.balanceOf(safu));
    //   const beforeDevFundBal = parseInt(await und.balanceOf(devFund));

    //   const stakingShare = parseInt((storedFeeTotal * stakeSharesPercent) / 100);
    //   const safuShare = parseInt(((storedFeeTotal - stakingShare) * safuSharesPercent) / 100);
    //   const devShare = storedFeeTotal - stakingShare - safuShare;

    //   await und.flipFeeDistribution();

    //   const stakingBal = parseInt(await und.balanceOf(stakePair.address));
    //   const safuBal = parseInt(await und.balanceOf(safu));
    //   const devFundBal = parseInt(await und.balanceOf(devFund));
    //   const storedFee = parseInt(await und.storedFee());

    //   assert.equal(stakingBal, beforeStakingBal + stakingShare, 'incorrect staking balance');
    //   assert.equal(safuBal, beforeSafuBal + safuShare, 'incorrect safu balance');
    //   assert.equal(devFundBal, beforeDevFundBal + devShare, 'incorrect dev fund balance');
    //   console.log(`staking: ${stakingShare}`);
    //   console.log(`safa: ${safuShare}`);
    //   console.log(`devFund: ${devShare}`);
    //   storedFeeTotal = 0;
    //   assert.equal(storedFee, storedFeeTotal, 'incorrect stored fee');
    //   assert.isTrue(await und.autoFeeDistribution(), 'incorrect autoFeeDistribution');
    // });

    it('Lock LPT - second', async () => {
      const LPTbal = parseInt(await pair.balanceOf(owner));
      const LPtokens = parseInt(LPTbal / 3); // Amount of token to be lock
      const beforeOwnerBal = parseInt(await und.balanceOf(owner));
      const beforeStakingBal = parseInt(await und.balanceOf(stakePair.address));
      const beforeLoanedAmount = parseInt(await und.checkLoan(owner, lockContract.address));

      const totalUSD = daiAmount * 2; // Total value in Liquidity pool
      const totalLPTokens = parseInt(await pair.totalSupply()); // Total token amount of Liq pool
      const LPTValueInDai = parseInt((totalUSD * LPtokens) / totalLPTokens); //% value of Liq pool in Dai
      const loanAmount = parseInt((LPTValueInDai * loanRate) / rateBalance); // Loan amount that user can get
      const feeAmount = parseInt((loanAmount * feeRate) / rateBalance); // Amount of fee
      // const stakingAmount = parseInt((feeAmount * stakeSharesPercent) / 100);
      const stakingAmount = 0;

      await pair.approve(lockContract.address, LPtokens);
      const receipt = await lockContract.lockLPT(LPtokens, loanAmount - feeAmount);
      expectEvent.inTransaction(receipt.tx, und, 'Mint', {
        user: owner,
        newMint: loanAmount.toString(),
      });

      const ownerBal = parseInt(await und.balanceOf(owner));
      const stakingBal = parseInt(await und.balanceOf(stakePair.address));
      const loanedAmount = parseInt(await und.checkLoan(owner, lockContract.address));

      assert.equal(ownerBal, beforeOwnerBal + (loanAmount - feeAmount), 'owner balance incorrect');
      assert.equal(stakingBal, beforeStakingBal + stakingAmount, 'staking balance incorrect');
      assert.equal(loanedAmount, beforeLoanedAmount + loanAmount, 'loaned amount incorrect');
      storedFeeTotal += feeAmount - stakingAmount;
      console.log(`staking: ${stakingAmount}`);
    });

    it("other user can't pay off someone elses loan", async () => {
      await expectRevert(
        lockContract.unlockLPT(10, {
          from: user,
        }),
        'Insufficient liquidity locked'
      );
    });

    it('can distribute the fee to safu and devFund', async () => {
      const beforeStoredFee = parseInt(await und.storedFee());
      assert.equal(beforeStoredFee, storedFeeTotal, 'incorrect before stored fee');

      const beforeStakingBal = parseInt(await und.balanceOf(stakePair.address));
      const beforeSafuBal = parseInt(await und.balanceOf(safu));
      const beforeDevFundBal = parseInt(await und.balanceOf(devFund));

      const stakingShare = parseInt((beforeStoredFee * stakeSharesPercent) / 100);
      const safuShare = parseInt(((storedFeeTotal - stakingShare) * safuSharesPercent) / 100);
      const devShare = storedFeeTotal - stakingShare - safuShare;

      await und.distributeFee({ from: user });

      const stakingBal = parseInt(await und.balanceOf(stakePair.address));
      const safuBal = parseInt(await und.balanceOf(safu));
      const devFundBal = parseInt(await und.balanceOf(devFund));
      const storedFee = parseInt(await und.storedFee());

      assert.equal(stakingBal, beforeStakingBal + stakingShare, 'incorrect staking balance');
      assert.equal(safuBal, beforeSafuBal + safuShare, 'incorrect safu balance');
      assert.equal(devFundBal, beforeDevFundBal + devShare, 'incorrect dev fund balance');
      console.log(`staking: ${stakingShare}`);
      console.log(`safa: ${safuShare}`);
      console.log(`devFund: ${devShare}`);
      storedFeeTotal = 0;
      assert.equal(storedFee, storedFeeTotal, 'incorrect stored fee');
    });

    it('cannot distribute after distributed', async () => {
      await expectRevert(und.distributeFee({ from: user }), 'There is nothing to distribute');
    });

    it('Unlock LPT', async () => {
      const uDaiBal = parseInt(await und.balanceOf(owner));
      const loanedAmount = await und.checkLoan(owner, lockContract.address);
      const LPtokens = parseInt(await pair.balanceOf(owner));
      const tokenBalBefore = await und.balanceOf(owner);
      const burnTokenAmount = parseInt((loanedAmount * burnTokens) / LPtokens);

      // burn
      const receipt = await lockContract.unlockLPT(burnTokens);
      expectEvent(receipt, 'UnlockLPT', {
        LPTamt: burnTokens.toString(),
        user: owner,
      });
      expectEvent.inTransaction(receipt.tx, und, 'Burn', {
        user: owner,
        burned: burnTokenAmount.toString(),
      });

      const tokenBal = parseInt(await und.balanceOf(owner));
      const newBal = parseInt(await pair.balanceOf(owner));
      const uDaiBalFinal = parseInt(await und.balanceOf(owner));

      assert.equal(tokenBal, tokenBalBefore - burnTokenAmount, 'token amount incorrect');
      assert.equal(newBal, LPtokens + burnTokens, 'valuing incorrect');
    });
  });
});
