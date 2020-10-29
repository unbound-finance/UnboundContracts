const uDai = artifacts.require("UnboundDollar");
const valuing = artifacts.require("Valuing_01");


// Deploys UND and 
module.exports = async (deployer, network, accounts) => {
  let safu1 = "0x";
  let devFund1 = "0x";

  if (network == "development" || network == "test") {
    safu1 = accounts[1];
    devFund1 = accounts[2];
  }
  
  await deployer.deploy(uDai, "Unbound Dollar", "UND", safu1, devFund1);
  await deployer.deploy(valuing, uDai.address);
  let unboundDai = await uDai.deployed();
  let valueContract = await valuing.deployed();

  // await valueContract.addLLC.sendTransaction(
  //   lockContract.address,
  //   loanRate,
  //   feeRate
  // );
  await valueContract.allowToken.sendTransaction(
    unboundDai.address
  );

  await unboundDai.changeValuator.sendTransaction(
    valueContract.address
  );
  
  console.log(unboundDai.address);
  console.log(valueContract.address);
};