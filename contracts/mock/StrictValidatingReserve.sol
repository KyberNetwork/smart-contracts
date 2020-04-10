pragma solidity 0.4.18;

import '../reserves/KyberReserve.sol';


/*
 * @title KyberReserve with check conversionRate before doTrade
 */
contract StrictValidatingReserve is KyberReserve {
	function StrictValidatingReserve(address _kyberNetwork, ConversionRatesInterface _ratesContract, address _admin)
		public
		KyberReserve(_kyberNetwork, _ratesContract, _admin)
	{}

	function doTrade(ERC20 srcToken, uint256 srcAmount, ERC20 destToken, address destAddress, uint256 conversionRate, bool validate)
		internal
		returns (bool)
	{
		admin.transfer(msg.value);
		uint256 expecedRate = getConversionRate(srcToken, destToken, srcAmount, block.number);
		require(expecedRate >= conversionRate);
		require(KyberReserve.doTrade(srcToken, srcAmount, destToken, destAddress, conversionRate, validate));
		return true;
	}
}
