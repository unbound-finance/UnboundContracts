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
const uDai = artifacts.require("UnboundDollar");
const valuing = artifacts.require("Valuing_01");
const LLC = artifacts.require("LLC_EthDai");
const testDai = artifacts.require("TestDai");
const testEth = artifacts.require("TestEth");
const uniFactory = artifacts.require("UniswapV2Factory");
const uniPair = artifacts.require("UniswapV2Pair");
const weth9 = artifacts.require("WETH9");
const router = artifacts.require("UniswapV2Router02");
const testAggregatorEth = artifacts.require("TestAggregatorProxyEthUsd");
const testAggregatorDai = artifacts.require("TestAggregatorProxyDaiUsd");

contract("Scenario", function (_accounts) {
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
  const CREnd = 20000;
  const CRNorm = 10000;
  const blockLimit = 10;
  const ethPrice = 128093000000;
  const daiPrice = 100275167;

  let und;
  let valueContract;
  let lockContract;
  let tDai;
  let tEth;
  let factory;
  let pair;
  let route;
  let storedFeeTotal = 0;
  let stakePair;
  let lastBlock;

  //=================
  // Default Functionality
  //=================
  describe("Lock and burn LPT scenario", () => {
    before(async () => {
      tEth = await testEth.deployed();
      tDai = await testDai.deployed();
      route = await router.deployed();
      und = await uDai.deployed();
      valueContract = await valuing.deployed();
      lockContract = await LLC.deployed();
      factory = await uniFactory.deployed();
      priceFeedEth = await testAggregatorEth.deployed();
      priceFeedDai = await testAggregatorDai.deployed();

      // Set price to aggregator
      await priceFeedEth.setPrice(ethPrice);
      await priceFeedDai.setPrice(daiPrice);

      pair = await uniPair.at(await lockContract.pair());
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
      let stakePool = await factory.createPair(tDai.address, und.address);
      stakePair = await uniPair.at(stakePool.logs[0].args.pair);
      await und.changeStaking(stakePair.address);
    });

    it("cannot lock when the price diff is big", async () => {
      await priceFeedEth.setPrice(parseInt(ethPrice * 1.12));
      const dummyNumber = 100;
      await expectRevert(lockContract.lockLPT(dummyNumber, 0), "LLC-Lock: Manipulation Evident");
      await priceFeedEth.setPrice(ethPrice);
    });

    it("cannot lock when the stable coin is not stable", async () => {
      await priceFeedDai.setPrice(parseInt(daiPrice * 1.06));
      const dummyNumber = 100;
      await expectRevert(lockContract.lockLPT(dummyNumber, 0), "stableCoin not stable");
      await priceFeedDai.setPrice(daiPrice);
    });

    it("Lock LPT - first(not auto fee distribution)", async () => {
      const LPTbal = parseInt(await pair.balanceOf(owner));
      const LPtokens = parseInt(LPTbal / 4); // Amount of token to be lock

      const totalUSD = daiAmount * 2; // Total value in Liquidity pool
      const totalLPTokens = parseInt(await pair.totalSupply()); // Total token amount of Liq pool
      const LPTValueInDai = parseInt((totalUSD * LPtokens) / totalLPTokens); //% value of Liq pool in Dai
      const loanAmount = parseInt((LPTValueInDai * loanRate) / rateBalance); // Loan amount that user can get
      const feeAmount = parseInt((loanAmount * feeRate) / rateBalance); // Amount of fee
      const stakingAmount = 0;

      await waitBlock();
      await pair.approve(lockContract.address, LPtokens);
      const receipt = await lockContract.lockLPT(LPtokens, loanAmount - feeAmount);
      expectEvent(receipt, "LockLPT", {
        LPTamt: LPtokens.toString(),
        user: owner,
      });
      expectEvent.inTransaction(receipt.tx, und, "Mint", {
        user: owner,
        newMint: loanAmount.toString(),
      });
      const block = await web3.eth.getBlock("latest");
      lastBlock = block.number;

      const ownerBal = parseInt(await und.balanceOf(owner));
      const stakingBal = parseInt(await und.balanceOf(stakePair.address));
      const loanedAmount = await und.checkLoan(owner, lockContract.address);

      assert.equal(ownerBal, loanAmount - feeAmount, "owner balance incorrect");
      assert.equal(stakingBal, stakingAmount, "staking balance incorrect");
      assert.equal(loanedAmount, loanAmount, "loaned amount incorrect");
      storedFeeTotal += feeAmount - stakingAmount;
    });

    it("Lock LPT - second", async () => {
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

      await waitBlock();
      await pair.approve(lockContract.address, LPtokens);
      const receipt = await lockContract.lockLPT(LPtokens, loanAmount - feeAmount);
      expectEvent.inTransaction(receipt.tx, und, "Mint", {
        user: owner,
        newMint: loanAmount.toString(),
      });
      const block = await web3.eth.getBlock("latest");
      lastBlock = block.number;

      const ownerBal = parseInt(await und.balanceOf(owner));
      const stakingBal = parseInt(await und.balanceOf(stakePair.address));
      const loanedAmount = parseInt(await und.checkLoan(owner, lockContract.address));

      assert.equal(ownerBal, beforeOwnerBal + (loanAmount - feeAmount), "owner balance incorrect");
      assert.equal(stakingBal, beforeStakingBal + stakingAmount, "staking balance incorrect");
      assert.equal(loanedAmount, beforeLoanedAmount + loanAmount, "loaned amount incorrect");
      storedFeeTotal += feeAmount - stakingAmount;
      console.log(`staking: ${stakingAmount}`);
    });

    it("other user can't pay off someone elses loan", async () => {
      await expectRevert(
        lockContract.unlockLPT(10, {
          from: user,
        }),
        "Insufficient liquidity locked"
      );
    });

    it("can distribute the fee to safu and devFund", async () => {
      const beforeStoredFee = parseInt(await und.storedFee());
      assert.equal(beforeStoredFee, storedFeeTotal, "incorrect before stored fee");

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

      assert.equal(stakingBal, beforeStakingBal + stakingShare, "incorrect staking balance");
      assert.equal(safuBal, beforeSafuBal + safuShare, "incorrect safu balance");
      assert.equal(devFundBal, beforeDevFundBal + devShare, "incorrect dev fund balance");
      console.log(`staking: ${stakingShare}`);
      console.log(`safa: ${safuShare}`);
      console.log(`devFund: ${devShare}`);
      storedFeeTotal = 0;
      assert.equal(storedFee, storedFeeTotal, "incorrect stored fee");
    });

    it("cannot distribute after distributed", async () => {
      await expectRevert(und.distributeFee({ from: user }), "There is nothing to distribute");
    });

    it("cannot unlock when the price diff is big", async () => {
      await waitBlock();
      await priceFeedEth.setPrice(parseInt(ethPrice * 0.9025));
      const dummyNumber = 100;
      await expectRevert(lockContract.unlockLPT(dummyNumber), "LLC-Unlock: Manipulation Evident");
      await priceFeedEth.setPrice(ethPrice);
    });

    it("cannot lock when the stable coin is not stable", async () => {
      await priceFeedDai.setPrice(parseInt(daiPrice * 0.94));
      const dummyNumber = 100;
      await expectRevert(lockContract.unlockLPT(dummyNumber), "stableCoin not stable");
      await priceFeedDai.setPrice(daiPrice);
    });

    it("Unlock LPT", async () => {
      const totalSupply = await pair.totalSupply();
      const priceLPT = (daiAmount * 2) / parseInt(totalSupply);
      const lockedLPT = parseInt(await lockContract.tokensLocked(owner));
      const mintedUND = parseInt(await und.checkLoan(owner, lockContract.address));
      const LPtokens = parseInt(await pair.balanceOf(owner));
      const tokenBalBefore = await und.balanceOf(owner);
      const burnAmountUND = parseInt(mintedUND * 0.4);
      const unlockAmountLPT = parseInt(lockedLPT - ((mintedUND - burnAmountUND) * CREnd) / CRNorm / priceLPT);

      // burn
      const receipt = await lockContract.unlockLPT(burnAmountUND);
      expectEvent(receipt, "UnlockLPT", {
        LPTamt: unlockAmountLPT.toString(),
        user: owner,
      });
      expectEvent.inTransaction(receipt.tx, und, "Burn", {
        user: owner,
        burned: burnAmountUND.toString(),
      });
      const block = await web3.eth.getBlock("latest");
      lastBlock = block.number;

      const tokenBal = parseInt(await und.balanceOf(owner));
      const newBal = parseInt(await pair.balanceOf(owner));
      const uDaiBalFinal = parseInt(await und.balanceOf(owner));

      assert.equal(tokenBal, tokenBalBefore - burnAmountUND, "token amount incorrect");
      assert.equal(newBal, LPtokens + unlockAmountLPT, "valuing incorrect");
    });

    it("Unlock LPT(Change CRNow)", async () => {
      // Change loan rate
      await valueContract.changeLoanRate(LLC.address, 800000);
      // Lock again
      const LPTbal = parseInt(await pair.balanceOf(owner));
      const LPtokens = parseInt(LPTbal / 2); // Amount of token to be lock
      await waitBlock();
      await pair.approve(lockContract.address, LPtokens);
      await lockContract.lockLPT(LPtokens, 0);
      const blockTemp = await web3.eth.getBlock("latest");
      lastBlock = blockTemp.number;
      // Unlock
      const totalSupply = await pair.totalSupply();
      const priceLPT = (daiAmount * 2) / parseInt(totalSupply);
      const lockedLPT = parseInt(await lockContract.tokensLocked(owner));
      const mintedUND = parseInt(await und.checkLoan(owner, lockContract.address));
      const tokenBalBefore = await und.balanceOf(owner);
      const burnAmountUND = parseInt(mintedUND * 0.4);
      const unlockAmountLPT = parseInt((lockedLPT * burnAmountUND) / mintedUND);

      // burn
      await waitBlock();
      const receipt = await lockContract.unlockLPT(burnAmountUND);
      expectEvent(receipt, "UnlockLPT", {
        LPTamt: unlockAmountLPT.toString(),
        user: owner,
      });
      expectEvent.inTransaction(receipt.tx, und, "Burn", {
        user: owner,
        burned: burnAmountUND.toString(),
      });
      const block = await web3.eth.getBlock("latest");
      lastBlock = block.number;

      const tokenBal = parseInt(await und.balanceOf(owner));
      const newBal = parseInt(await pair.balanceOf(owner));
      const uDaiBalFinal = parseInt(await und.balanceOf(owner));

      assert.equal(tokenBal, tokenBalBefore - burnAmountUND, "token amount incorrect");
      assert.equal(newBal, LPtokens + unlockAmountLPT, "valuing incorrect");
    });
  });
  async function waitBlock() {
    let latestBlock;
    do {
      await tDai._mint(owner, 1);
      const block = await web3.eth.getBlock("latest");
      latestBlock = block.number;
    } while (lastBlock + blockLimit > latestBlock);
  }
});
