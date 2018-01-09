module.exports = {
    // testrpcOptions: '-p 8550',
    // port: 8550,
    // testrpcOptions: '-p 6545 -u 0x54fd80d6ae7584d8e9a19fe1df43f04e5282cc43',
    testCommand: 'npm test -- --network coverage --debug',
    // norpc: true,
    // dir: './secretDirectory', 1684335, 3882390, 5481031, 6092825
    skipFiles: [
      'mockContracts/TestToken.sol',
      'mockContracts/MockCentralBank.sol',
      'mockContracts/MockExchangeDepositAddress.sol',
      'mockContracts/MockDepositExchange.sol',
      'mockContracts/MockDepositAddress.sol',
      'mockContracts/MockDepositAddressEther.sol',
      'mockContracts/MockDepositAddressToken.sol',
      'mockContracts/MockImbalanceRecorder.sol',
      'mockContracts/MockPermission.sol',
      'mockContracts/MockWithdrawable.sol',
      'mockContracts/MockExchange.sol',
      'mockContracts/Wrapper.sol',
      'ERC20Interface.sol'
    ]
};
