pragma solidity ^0.4.18;

contract PermissionGroups {

    address public admin;
    address public pendingAdmin;
    mapping(address=>bool) operators;
    mapping(address=>bool) alerters;
    address[] public operatorsGroup;
    address[] public alertersGroup;

    function PermissionGroups() public {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require (msg.sender == admin);
        _;
    }

    modifier onlyOperator() {
        require (operators[msg.sender]);
        _;
    }

    modifier onlyAlerter() {
        require (alerters[msg.sender]);
        _;
    }

    event TransferAdmin(address pendingAdmin);

    /**
     * @dev Allows the current admin to set the pendingAdmin address.
     * @param newAdmin The address to transfer ownership to.
     */
    function transferAdmin(address newAdmin) public onlyAdmin {
        require(newAdmin !=  address(0));
        TransferAdmin(pendingAdmin);
        pendingAdmin = newAdmin;
    }

    event ClaimAdmin( address newAdmin, address previousAdmin);

    /**
     * @dev Allows the pendingAdmin address to finalize the change admin process.
     */
    function claimAdmin() public {
        require(pendingAdmin == msg.sender);
        ClaimAdmin(pendingAdmin, admin);
        admin = pendingAdmin;
        pendingAdmin = address(0);
    }

    event AddAlerter (address newAlerter, bool isAdd);

    function addAlerter(address newAlerter) public onlyAdmin {
        require(!alerters[newAlerter]); // prevent duplicates.
        AddAlerter(newAlerter, true);
        alerters[newAlerter] = true;
        alertersGroup.push(newAlerter);
    }

    function removeAlerter (address alerter) public onlyAdmin {

        require(alerters[alerter]);
        alerters[alerter] = false;

        for (uint i = 0; i < alertersGroup.length; ++i)
        {
            if (alertersGroup[i] == alerter)
            {
                alertersGroup[i] = alertersGroup[alertersGroup.length - 1];
                alertersGroup.length--;
                AddAlerter(alerter, false);
                break;
            }
        }
    }

    event AddOperator(address newOperator, bool isAdd);

    function addOperator(address newOperator) public onlyAdmin {
        require(!operators[newOperator]); // prevent duplicates.
        AddOperator(newOperator, true);
        operators[newOperator] = true;
        operatorsGroup.push(newOperator);
    }

    function removeOperator (address operator) public onlyAdmin {

        require (operators[operator]);
        operators[operator] = false;

        for (uint i = 0; i < operatorsGroup.length; ++i)
        {
            if (operatorsGroup[i] == operator)
            {
                operatorsGroup[i] = operatorsGroup[operatorsGroup.length - 1];
                operatorsGroup.length -= 1;
                AddOperator(operator, false);
                break;
            }
        }
    }
}
