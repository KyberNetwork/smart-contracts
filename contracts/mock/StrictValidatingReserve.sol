pragma solidity 0.4.18;

import '../reserves/KyberReserve.sol';

import './Bank.sol';


/*
 * @title KyberReserve with check conversionRate before doTrade
 */
contract StrictValidatingReserve is KyberReserve {
    Bank bank;

	function StrictValidatingReserve(address _kyberNetwork, ConversionRatesInterface _ratesContract, address _admin, Bank _bank)
		public
		KyberReserve(_kyberNetwork, _ratesContract, _admin)
	{
        bank = _bank;
    }

	function doTrade(ERC20 srcToken, uint256 srcAmount, ERC20 destToken, address destAddress, uint256 conversionRate, bool validate)
		internal
		returns (bool)
	{
        bank.transfer(msg.value); // reduce the reserve balance before the call
		uint256 expecedRate = getConversionRate(srcToken, destToken, srcAmount, block.number);
		require(expecedRate >= conversionRate);
		require(KyberReserve.doTrade(srcToken, srcAmount, destToken, destAddress, conversionRate, validate));
        bank.withdraw(); // transfer ether back to reserve contract
		return true;
	}
}
