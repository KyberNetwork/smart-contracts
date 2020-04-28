pragma solidity 0.4.18;

import "../Withdrawable.sol";
import "../PermissionGroups.sol";


contract WrapperBase is Withdrawable {

    PermissionGroups public wrappedContract;

    function WrapperBase(PermissionGroups _wrappedContract) public {
        require(_wrappedContract != address(0));
        wrappedContract = _wrappedContract;
    }

    function claimWrappedContractAdmin() public onlyAdmin {
        wrappedContract.claimAdmin();
    }

    function transferWrappedContractAdmin (address newAdmin) public onlyAdmin {
        wrappedContract.transferAdmin(newAdmin);
    }

    function addAlerterWrappedContract (address _alerter) public onlyAdmin {
        require(_alerter != address(0));
        wrappedContract.addAlerter(_alerter);
    }

    function addOperatorWrappedContract (address _operator) public onlyAdmin {
        require(_operator != address(0));
        wrappedContract.addOperator(_operator);
    }

    function removeAlerterWrappedContract (address _alerter) public onlyAdmin {
        require(_alerter != address(0));
        wrappedContract.removeAlerter(_alerter);
    }

    function removeOperatorWrappedContract (address _operator) public onlyAdmin {
        require(_operator != address(0));
        wrappedContract.removeOperator(_operator);
    }
}
