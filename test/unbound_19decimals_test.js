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
const testDai = artifacts.require('TestDai19');
const testEth = artifacts.require('TestEth');
const uniFactory = artifacts.require('UniswapV2Factory');
const uniPair = artifacts.require('UniswapV2Pair');

const weth9 = artifacts.require('WETH9');

const router = artifacts.require('UniswapV2Router02');

contract('unboundSystem decimals19', function (_accounts) {
  // Initial settings
  const totalSupply = 0;
  const decimal = 10 ** 18;
  const stablecoinDecimal = 10 ** 19;
  const amount = 0;
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

  let unboundDai;
  let valueContract;
  let lockContract;
  let tDai;
  let tEth;
  let weth;
  let factory;
  let pair;
  let route;
  let lockedTokens;
  let storedFee = 0;

  /////////
  let stakePair;

  //=================
  // Default Functionality
  //=================
  describe('Check default functionality', () => {
    before(async function () {
      unboundDai = await uDai.deployed();
      valueContract = await valuing.deployed();

      factory = await uniFactory.deployed();
      tEth = await testEth.deployed();
      tDai = await testDai.deployed();
      // lockContract = await LLC.deployed();
      weth = await weth9.deployed();
      route = await router.deployed();

      const pairAddr = await factory.createPair(tDai.address, tEth.address);
      pair = await uniPair.at(pairAddr.logs[0].args.pair);

      lockContract = await LLC.new(valueContract.address, pairAddr.logs[0].args.pair, tDai.address, unboundDai.address);

      const permissionLLC = await valueContract.addLLC(lockContract.address, loanRate, feeRate);
      const permissionUdai = await valueContract.allowToken(unboundDai.address);

      const newValuator = await unboundDai.changeValuator(valueContract.address);

      const approveTdai = await tDai.approve(route.address, 400000);
      const approveTeth = await tEth.approve(route.address, 1000);

      const d = new Date();
      const time = d.getTime();
      const addLiq = await route.addLiquidity(
        tDai.address,
        tEth.address,
        daiAmount,
        1000,
        3000,
        10,
        owner,
        parseInt(time / 1000 + 100)
      );

      const stakePool = await factory.createPair(tDai.address, unboundDai.address);
      stakePair = await uniPair.at(stakePool.logs[0].args.pair);

      await unboundDai.changeStaking(stakePair.address);
    });

    //=== UnboundDai ===//
    it('UND should have 0 as total suply', async () => {
      const retval = await unboundDai.totalSupply();
      assert.equal(retval, totalSupply * decimal, 'Total suply is not 0');
    });

    it('UND should have valuator', async () => {
      const retval = await unboundDai.valuator();
      assert.equal(retval, valueContract.address, 'incorrect Valuator');
    });

    it('UND should have staking contract address', async () => {
      const retval = await unboundDai.stakeAddr();
      assert.equal(retval, stakePair.address, 'incorrect staking contract address');
    });

    it('UND should have emergency fund address', async () => {
      const retval = await unboundDai.safuAddr();
      assert.equal(retval, safu, 'incorrect emergency fund address');
    });

    it('UND should have dev fund address', async () => {
      const retval = await unboundDai.devFundAddr();
      assert.equal(retval, devFund, 'incorrect dev fund address');
    });

    it('UND should not transfer', async () => {
      const transferAmount = 5;

      await expectRevert(unboundDai.transfer(user, transferAmount), 'ERC20: transfer amount exceeds balance');
    });

    it('UND should not transferFrom', async () => {
      const transferAmount = 5;

      await expectRevert(
        unboundDai.transferFrom(user, owner, transferAmount),
        'ERC20: transfer amount exceeds balance'
      );
    });

    it('UND should be not auto fee distribution', async () => {
      assert.isFalse(await unboundDai.autoFeeDistribution(), 'incorrect autoFeeDistribution');
    });

    it('UND should be able to change autoFeeDistribution', async () => {
      await unboundDai.flipFeeDistribution();

      assert.isTrue(await unboundDai.autoFeeDistribution(), 'incorrect autoFeeDistribution');
    });

    //=== LLC ===//
    it('valuator has correct LLC', async () => {
      let LLCstruct = await valueContract.getLLCStruct(lockContract.address);
      assert.equal(LLCstruct.loanrate.words[0], loanRate, 'incorrect loanRate');
      assert.equal(LLCstruct.fee.words[0], feeRate, 'incorrect feeRate');
    });

    it('cannot unboundCreate() on valuator', async () => {
      const anyNumber = 123;
      await expectRevert(valueContract.unboundCreate(20, owner, unboundDai.address, anyNumber), 'LLC not authorized');
    });

    it('cannot lockLPT() without enough tokens', async () => {
      const lockAmount = 10;
      const anyNumber = 123;

      await expectRevert(
        lockContract.lockLPT(lockAmount, anyNumber, {
          from: user,
        }),
        'LLC: Insufficient LPTs'
      );
    });

    it('cannot lockLPT() small amount', async () => {
      const lockAmount = 1;
      const anyNumber = 123;

      await pair.approve(lockContract.address, lockAmount);
      await expectRevert(lockContract.lockLPT(lockAmount, anyNumber), 'amount is too small');
    });

    it('UND mint - first', async () => {
      const LPTbal = parseInt(await pair.balanceOf(owner));
      const LPtokens = parseInt(LPTbal / 4); // Amount of token to be lock
      lockedTokens = LPtokens;
      const totalUSD = daiAmount * 2; // Total value in Liquidity pool

      const totalLPTokens = parseInt(await pair.totalSupply()); // Total token amount of Liq pool
      const LPTValueInDai = parseInt(((totalUSD * LPtokens) / totalLPTokens) * (decimal / stablecoinDecimal)); //% value of Liq pool in Dai
      const loanAmount = parseInt((LPTValueInDai * loanRate) / rateBalance); // Loan amount that user can get
      const feeAmount = parseInt((loanAmount * feeRate) / rateBalance); // Amount of fee
      const stakingAmount = parseInt((feeAmount * stakeSharesPercent) / 100);

      await pair.approve(lockContract.address, LPtokens);
      await lockContract.lockLPT(LPtokens, loanAmount - feeAmount);
      const ownerBal = parseInt(await unboundDai.balanceOf(owner));
      const stakingBal = parseInt(await unboundDai.balanceOf(stakePair.address));

      assert.equal(ownerBal, loanAmount - feeAmount, 'owner balance incorrect');
      assert.equal(stakingBal, stakingAmount, 'staking balance incorrect');
      console.log(`staking: ${stakingAmount}`);
      storedFee += feeAmount - stakingAmount;

      const tokenBal0 = parseInt(await unboundDai.checkLoan(owner, lockContract.address));

      assert.equal(tokenBal0, loanAmount, 'loan amount incorrect');
    });

    it('UND mint - second', async () => {
      const LPTbal = await pair.balanceOf(owner);
      const LPtokens = parseInt(LPTbal.words[0] / 3);

      const totalUSD = daiAmount * 2; // Total value in Liquidity pool
      const totalLPTokens = parseInt(await pair.totalSupply()); // Total token amount of Liq pool
      const LPTValueInDai = parseInt(((totalUSD * LPtokens) / totalLPTokens) * (decimal / stablecoinDecimal)); //% value of Liq pool in Dai
      const loanAmount = parseInt((LPTValueInDai * loanRate) / rateBalance); // Loan amount that user can get
      const feeAmount = parseInt((loanAmount * feeRate) / rateBalance); // Amount of fee
      const stakingAmount = parseInt((feeAmount * stakeSharesPercent) / 100);

      // second mint
      await pair.approve(lockContract.address, LPtokens);
      await lockContract.lockLPT(LPtokens, loanAmount - feeAmount);
      const newBal = await pair.balanceOf(owner);
      assert.equal(newBal, LPTbal - LPtokens, 'valuing incorrect');
      console.log(`staking: ${stakingAmount}`);
      storedFee += feeAmount - stakingAmount;
    });

    it('UND burn', async () => {
      const uDaiBal = parseInt(await unboundDai.balanceOf(owner));
      const tokenBal4 = await unboundDai.checkLoan(owner, lockContract.address);

      const LPTbal = await pair.balanceOf(owner);
      const LPtokens = parseInt(LPTbal.words[0]);
      const tokenBal0 = await unboundDai.balanceOf(owner);

      // burn
      const burn = await lockContract.unlockLPT(lockedTokens, unboundDai.address);
      const tokenBal1 = await unboundDai.balanceOf(owner);
      const newBal = parseInt(await pair.balanceOf(owner));

      assert.equal(newBal, LPtokens + lockedTokens, 'valuing incorrect');
    });

    it('UND can transfer', async () => {
      const transferAmount = 10;
      const beforeBal = parseInt(await unboundDai.balanceOf(owner));
      const beforeUser = parseInt(await unboundDai.balanceOf(user));

      let theTransfer = await unboundDai.transfer(user, transferAmount);
      let finalBal = parseInt(await unboundDai.balanceOf(owner));
      let userBal = parseInt(await unboundDai.balanceOf(user));

      assert.equal(userBal, beforeUser + transferAmount, 'receiver balance incorrect');
      assert.equal(finalBal, beforeBal - transferAmount, 'sender balance incorrect');
    });

    it('UND can distribute the fee to safu and devFund', async () => {
      const beforeStoredFee = parseInt(await unboundDai.storedFee());
      assert.equal(beforeStoredFee, storedFee, 'incorrect before stored fee');

      const beforeSafuBal = parseInt(await unboundDai.balanceOf(safu));
      const beforeDevFundBal = parseInt(await unboundDai.balanceOf(devFund));
      const safuShare = parseInt((storedFee * safuSharesPercent) / 100);

      await unboundDai.distributeFee({ from: user });

      const afterSafuBal = parseInt(await unboundDai.balanceOf(safu));
      const afterDevFundBal = parseInt(await unboundDai.balanceOf(devFund));
      const afterStoredFee = parseInt(await unboundDai.storedFee());

      assert.equal(afterSafuBal, beforeSafuBal + safuShare, 'incorrect safu balance');
      console.log(`safa: ${safuShare}`);
      assert.equal(afterDevFundBal, beforeDevFundBal + storedFee - safuShare, 'incorrect dev fund balance');
      console.log(`devFund: ${storedFee - safuShare}`);
      storedFee = 0;
      assert.equal(afterStoredFee, storedFee, 'incorrect stored fee');
    });

    it('LLC can claim tokens', async () => {
      let sendEth = await tEth.transfer(lockContract.address, 10);
      let claim = await lockContract.claimTokens(tEth.address, user);
      let finalBalance = await tEth.balanceOf(user);

      assert.equal(10, finalBalance.words[0], 'Claim is not working');
    });

    it('LLC cannot claim from its own Liquidity Pool', async () => {
      let sendEth = await tEth.transfer(lockContract.address, 10);
      await expectRevert(lockContract.claimTokens(pair.address, user), 'Cannot move LP tokens');
    });

    it("LLC - other user can't pay off someone elses loan", async () => {
      let LPTbal = await pair.balanceOf(owner);
      let LPtokens = parseInt(LPTbal.words[0] / 3);
      const totalUSD = daiAmount * 2; // Total value in Liquidity pool
      const totalLPTokens = parseInt(await pair.totalSupply()); // Total token amount of Liq pool
      const LPTValueInDai = parseInt(((totalUSD * LPtokens) / totalLPTokens) * (decimal / stablecoinDecimal)); //% value of Liq pool in Dai
      const loanAmount = parseInt((LPTValueInDai * loanRate) / rateBalance); // Loan amount that user can get
      const feeAmount = parseInt((loanAmount * feeRate) / rateBalance); // Amount of fee

      // first mint
      await pair.approve(lockContract.address, LPtokens);
      await lockContract.lockLPT(LPtokens, loanAmount - feeAmount);

      // user A balance before
      let tokenBal = await unboundDai.balanceOf(owner);
      tokenBal = parseInt(tokenBal.words[0] / 4);

      // user B balance before
      let beforeSafuBal = await unboundDai.balanceOf(user);
      beforeSafuBal = beforeSafuBal.words[0];

      // transfer funds to other user
      let moveUND = await unboundDai.transfer(user, tokenBal);

      // Trys to unlockLPT with User B
      await expectRevert(
        lockContract.unlockLPT(LPtokens, unboundDai.address, {
          from: user,
        }),
        'Insufficient liquidity locked'
      );
    });
  });
});
