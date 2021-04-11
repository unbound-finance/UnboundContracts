/* eslint-disable no-undef */
/*
 * OpenZeppelin Test Helpers
 * https://github.com/OpenZeppelin/openzeppelin-test-helpers
 */
const { BN, constants, balance, expectEvent, expectRevert } = require("@openzeppelin/test-helpers");
const helper = require("./helper");

/*
 *  ========================================================
 *  Tests of public & external functions in Tier1a contract
 *  ========================================================
 */
const uDai = artifacts.require("UnboundDollar");
const valuing = artifacts.require("Valuing_01");
const LLC = artifacts.require("LLC_BatDai");
const testDai = artifacts.require("TestDai");
const testEth = artifacts.require("TestEth");
const testBat = artifacts.require("TestBat");
const uniFactory = artifacts.require("UniswapV2Factory");
const uniPair = artifacts.require("UniswapV2Pair");
const router = artifacts.require("UniswapV2Router02");
const testAggregatorEth = artifacts.require("TestAggregatorProxyEthUsd");
const testAggregatorDai = artifacts.require("TestAggregatorProxyDaiUsd");
const testAggregatorBat = artifacts.require("TestAggregatorProxyBatEth");
const oracle = artifacts.require("UniswapV2PriceProvider");

contract("Scenario(multi price feed)", function (_accounts) {
  // Initial settings
  const totalSupply = 0;
  const decimal = 10 ** 18;
  const owner = _accounts[0];
  const safu = _accounts[1];
  const devFund = _accounts[2];
  const user = _accounts[3];
  const daiAmount = 400000000;
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
  const batPrice = 229884831176629;

  const base = new BN("1000000000000000000");

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
  let Oracle;

  //=================
  // Default Functionality
  //=================
  describe("Lock and burn LPT scenario", () => {
    before(async () => {
      tEth = await testEth.deployed();
      tBat = await testBat.deployed();
      tDai = await testDai.deployed();
      route = await router.deployed();
      und = await uDai.deployed();
      valueContract = await valuing.deployed();
      lockContract = await LLC.deployed();
      factory = await uniFactory.deployed();
      priceFeedEth = await testAggregatorEth.deployed();
      priceFeedDai = await testAggregatorDai.deployed();
      priceFeedBat = await testAggregatorBat.deployed();

      const oracleAddr = await lockContract.getOracle();
      Oracle = await oracle.at(oracleAddr);

      // Set price to aggregator
      await priceFeedEth.setPrice(ethPrice);
      await priceFeedDai.setPrice(daiPrice);
      await priceFeedBat.setPrice(batPrice);

      pair = await uniPair.at(await lockContract.pair());
      await tDai.approve(route.address, daiAmount);
      await tBat.approve(route.address, parseInt((daiAmount * daiPrice) / (batPrice / 10 ** 18) / ethPrice));
      let d = new Date();
      let time = d.getTime();
      await route.addLiquidity(
        tDai.address,
        tBat.address,
        daiAmount,
        parseInt((daiAmount * daiPrice) / (batPrice / 10 ** 18) / ethPrice),
        3000,
        10,
        owner,
        parseInt(time / 1000 + 100)
      );
      let stakePool = await factory.createPair(tDai.address, und.address);
      stakePair = await uniPair.at(stakePool.logs[0].args.pair);
      await und.changeStaking(stakePair.address);
    });

    it("cannot lock when LP amount too small", async () => {
      await priceFeedEth.setPrice(parseInt(ethPrice * 1.12));
      const dummyNumber = 100;
      await expectRevert(lockContract.lockLPT(dummyNumber + 900000000000, 0), "LLC: Insufficient user balance")
      await expectRevert(lockContract.lockLPT(dummyNumber, 0), "LLC: Insufficient Allowance")
      await pair.approve(lockContract.address, dummyNumber);
      await expectRevert(lockContract.lockLPT(dummyNumber, 0), "Too small loan value to pay the fee");
      await priceFeedEth.setPrice(ethPrice);
    });

    it("Lock LPT - first(not auto fee distribution)", async () => {
      const LPTbal = parseInt(await pair.balanceOf(owner));
      const LPtokens = parseInt(LPTbal / 4); // Amount of token to be lock

      const reserves = await pair.getReserves();
      

      const ethPriceNormalized = (new BN(ethPrice.toString())).mul(new BN("10000000000"));
      const priceOfBat = ethPriceNormalized.mul(new BN(batPrice.toString())).div(base);
      
      
      let batReserve;
      let batValue;
      if (reserves._reserve0.toString() === daiAmount.toString()) {
        batReserve = new BN(reserves._reserve1.toString());
        batValue = batReserve.mul(priceOfBat).div(base);
        
      } else {
        batReserve = new BN(reserves._reserve0.toString());
        batValue = batReserve.mul(priceOfBat).div(base);
      }

      // console.log("batValue: ", batValue.toString());
      // console.log("daiValue: ", daiAmount);

      const totalUSD = (new BN(daiAmount.toString())).add(batValue);
      const totalLPTokens = await pair.totalSupply(); // Total token amount of Liq pool
      const priceOfLp = totalUSD.mul(base).div(totalLPTokens)
      const LPTValueInDai = parseInt((priceOfLp.mul(new BN(LPtokens.toString()))).div(base)); //% value of Liq pool in Dai
      
      const loanAmount = parseInt((LPTValueInDai * loanRate) / rateBalance); // Loan amount that user can get
      const feeAmount = parseInt((loanAmount * feeRate) / rateBalance); // Amount of fee
      const stakingAmount = 0;

      await helper.advanceBlockNumber(blockLimit);
      await pair.approve(lockContract.address, LPtokens);
      const receipt = await lockContract.lockLPT(LPtokens, 1);
      
      // console.log("LPTValue: ", LPTValueInDai )
      // const test = await lockContract.getTest();
      // console.log("test: ", test.toString());

      

      // const test = await Oracle.getTest();
      // const test2 = await Oracle.getTest2();

      const ethDecimal = await priceFeedEth.decimals();
      const batDecimal = await priceFeedBat.decimals();
      

      expectEvent(receipt, "LockLPT", {
        LPTAmt: LPtokens.toString(),
        user: owner,
      });
      expectEvent.inTransaction(receipt.tx, und, "Mint", {
        user: owner,
        newMint: loanAmount.toString(),
      });

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

      const reserves = await pair.getReserves();
      
      const ethPriceNormalized = (new BN(ethPrice.toString())).mul(new BN("10000000000"));
      const priceOfBat = ethPriceNormalized.mul(new BN(batPrice.toString())).div(base);
      
      
      let batReserve;
      let batValue;
      if (reserves._reserve0.toString() === daiAmount.toString()) {
        batReserve = new BN(reserves._reserve1.toString());
        batValue = batReserve.mul(priceOfBat).div(base);
        
      } else {
        batReserve = new BN(reserves._reserve0.toString());
        batValue = batReserve.mul(priceOfBat).div(base);
      }

      const totalUSD = (new BN(daiAmount.toString())).add(batValue);
      const totalLPTokens = await pair.totalSupply(); // Total token amount of Liq pool
      const priceOfLp = totalUSD.mul(base).div(totalLPTokens)
      const LPTValueInDai = parseInt((priceOfLp.mul(new BN(LPtokens.toString()))).div(base)); //% value of Liq pool in Dai
      
      const loanAmount = parseInt((LPTValueInDai * loanRate) / rateBalance); // Loan amount that user can get
      const feeAmount = parseInt((loanAmount * feeRate) / rateBalance); // Amount of fee
      // const stakingAmount = parseInt((feeAmount * stakeSharesPercent) / 100);
      const stakingAmount = 0;

      await helper.advanceBlockNumber(blockLimit);
      await pair.approve(lockContract.address, LPtokens);
      const receipt = await lockContract.lockLPT(LPtokens, loanAmount - feeAmount);
      expectEvent.inTransaction(receipt.tx, und, "Mint", {
        user: owner,
        newMint: loanAmount.toString(),
      });

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

    // Should be geometric mean test
    // !!!!!!!!!!!!!
    // it("cannot unlock when the price diff is big", async () => {
    //   await helper.advanceBlockNumber(blockLimit);
    //   await priceFeedBat.setPrice(parseInt(batPrice * 0.9));
    //   const dummyNumber = 10;
    //   // await expectRevert(lockContract.unlockLPT(dummyNumber), "LLC: Manipulation Evident");
    //   await priceFeedBat.setPrice(batPrice);
    // });

    it("cannot lock when the stable coin is not stable", async () => {
      await priceFeedDai.setPrice(parseInt(daiPrice * 0.94));
      const dummyNumber = 10;
      await helper.advanceBlockNumber(blockLimit);
      await lockContract.unlockLPT(dummyNumber);

      const test = await lockContract.getTest();
      const test2 = await lockContract.getTest2();
      const test3 = await lockContract.getTest3();

      console.log(test.toString());
      console.log(test2.toString());
      console.log(test3.toString());
      // await expectRevert(lockContract.unlockLPT(dummyNumber), "stableCoin not stable");
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

      // const unlockAmountLPT = parseInt(lockedLPT - ((mintedUND - burnAmountUND) * CREnd) / CRNorm / priceLPT);

      const unlockAmountLPT = parseInt((lockedLPT * burnAmountUND) / mintedUND);
      // burn
      const receipt = await lockContract.unlockLPT(burnAmountUND);
      expectEvent(receipt, "UnlockLPT", {
        LPTAmt: unlockAmountLPT.toString(),
        user: owner,
      });
      expectEvent.inTransaction(receipt.tx, und, "Burn", {
        user: owner,
        burned: burnAmountUND.toString(),
      });

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
      await helper.advanceBlockNumber(blockLimit);
      await pair.approve(lockContract.address, LPtokens);
      await lockContract.lockLPT(LPtokens, 0);
      const blockTemp = await web3.eth.getBlock("latest");
      lastBlock = blockTemp.number;
      const beforeBalance = parseInt(await pair.balanceOf(owner));
      // Unlock

      const totalSupply = await pair.totalSupply();
      const priceLPT = (daiAmount * 2) / parseInt(totalSupply);
      const lockedLPT = parseInt(await lockContract.tokensLocked(owner));
      const mintedUND = parseInt(await und.checkLoan(owner, lockContract.address));
      const tokenBalBefore = await und.balanceOf(owner);
      const burnAmountUND = parseInt(mintedUND * 0.4);
      // const unlockAmountLPT = parseInt((lockedLPT * burnAmountUND) / mintedUND);
      const unlockAmountLPT = parseInt(lockedLPT - ((mintedUND - burnAmountUND) * CREnd) / CRNorm / priceLPT);

      // burn
      await helper.advanceBlockNumber(blockLimit);
      const receipt = await lockContract.unlockLPT(burnAmountUND);
      expectEvent(receipt, "UnlockLPT", {
        LPTAmt: unlockAmountLPT.toString(),
        user: owner,
      });
      expectEvent.inTransaction(receipt.tx, und, "Burn", {
        user: owner,
        burned: burnAmountUND.toString(),
      });

      const tokenBal = parseInt(await und.balanceOf(owner));
      const balance = parseInt(await pair.balanceOf(owner));

      assert.equal(tokenBal, tokenBalBefore - burnAmountUND, "token amount incorrect");
      assert.equal(balance, beforeBalance + unlockAmountLPT, "valuing incorrect");
    });
  });
});
