pragma solidity 0.4.18;


contract NimbleReserveIf {
    address public NimbleNetwork;
}


interface NimbleReserveInterface {

    function trade(address srcToken, uint srcAmount, address destToken, address destAddress, uint conversionRate,
        bool validate) public payable returns(bool);
    function getConversionRate(address src, address dest, uint srcQty, uint blockNumber) public view returns(uint);
}


contract NimbleNetworkIf {
    NimbleReserveInterface[] public reserves;
    function getNumReserves() public view returns(uint);
}


contract CheckReservePoint {

    NimbleNetworkIf constant Nimble = NimbleNetworkIf(0x65bF64Ff5f51272f729BDcD7AcFB00677ced86Cd);
    NimbleNetworkIf constant oldNimble = NimbleNetworkIf(0x9ae49C0d7F8F9EF4B864e004FE86Ac8294E20950);

    function checkPointing() public view returns(address[] goodPoint, address[] oldNimbles, address[] badPoint, uint numReserves, uint oldIndex, uint goodIndex) {
        numReserves = Nimble.getNumReserves();

        goodPoint = new address[](numReserves);
        oldNimbles = new address[](numReserves);
        badPoint = new address[](10);

        uint badIndex;

        NimbleReserveIf reserve;

        for (uint i = 0; i < numReserves; i ++) {
            reserve = NimbleReserveIf(Nimble.reserves(i));

            if (reserve.NimbleNetwork() == address(oldNimble)) {
                oldNimbles[oldIndex++] = address(reserve);
            } else if (reserve.NimbleNetwork() == address(Nimble)){
                goodPoint[goodIndex++] = address(reserve);
            } else {
                badPoint[badIndex++] = address(reserve);
            }
        }
    }
}
