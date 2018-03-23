pragma solidity 0.4.18;


import "./WrapperBase.sol";


contract MockWrapperBase is WrapperBase {

    PermissionGroups public wrappedContract;
    uint public data;

    function MockWrapperBase(PermissionGroups _wrappedContract, address admin, uint lastIndex) public
        WrapperBase(_wrappedContract, admin, lastIndex)
    {
        wrappedContract = _wrappedContract;
    }

    function mockSetNewData(uint newData, uint dataIndex) public onlyOperator {
        setNewData(dataIndex);
        data = newData;
    }

    function mockAddSignature(uint dataIndex, uint signedNonce, address signer) public returns(bool all) {
        all = addSignature(dataIndex, signedNonce, signer);
        return(all);
    }

    function mockGetDataTrackingParameters(uint index) public view returns (address[], uint) {
        return(getDataTrackingParameters(index));
    }
}
