pragma solidity 0.5.11;

import "./AssertBytes.sol";
import "./truffle/Assert.sol";
import "../../../contractsSol5/utils/BytesLib.sol";


contract TestBytesLib2 {
    using BytesLib for bytes;

    bytes storageCheckBytes = hex"aabbccddeeff";
    bytes storageCheckBytesZeroLength = hex"";

    /**
    * Sanity Checks
    */

    function testSanityCheck() public {
        // Assert library sanity checks
        //
        // Please don't change the ordering of the var definitions
        // the order is purposeful for testing zero-length arrays
        bytes memory checkBytes = hex"aabbccddeeff";
        bytes memory checkBytesZeroLength = hex"";

        bytes memory checkBytesRight = hex"aabbccddeeff";
        bytes memory checkBytesZeroLengthRight = hex"";
        bytes memory checkBytesWrongLength = hex"aa0000";
        bytes memory checkBytesWrongContent = hex"aabbccddee00";

        // This next line is needed in order for Truffle to activate the Solidity unit testing feature
        // otherwise it doesn't interpret any events fired as results of tests
        Assert.equal(uint256(1), uint256(1), "This should not fail! :D");

        AssertBytes.equal(checkBytes, checkBytesRight, "Sanity check should be checking equal bytes arrays out.");
        AssertBytes.notEqual(checkBytes, checkBytesWrongLength, "Sanity check should be checking different length bytes arrays out.");
        AssertBytes.notEqual(checkBytes, checkBytesWrongContent, "Sanity check should be checking different content bytes arrays out.");

        AssertBytes.equalStorage(storageCheckBytes, checkBytesRight, "Sanity check should be checking equal bytes arrays out. (Storage)");
        AssertBytes.notEqualStorage(storageCheckBytes, checkBytesWrongLength, "Sanity check should be checking different length bytes arrays out. (Storage)");
        AssertBytes.notEqualStorage(storageCheckBytes, checkBytesWrongContent, "Sanity check should be checking different content bytes arrays out. (Storage)");

        // Zero-length checks
        AssertBytes.equal(checkBytesZeroLength, checkBytesZeroLengthRight, "Sanity check should be checking equal zero-length bytes arrays out.");
        AssertBytes.notEqual(checkBytesZeroLength, checkBytes, "Sanity check should be checking different length bytes arrays out.");

        AssertBytes.equalStorage(storageCheckBytesZeroLength, checkBytesZeroLengthRight, "Sanity check should be checking equal zero-length bytes arrays out. (Storage)");
        AssertBytes.notEqualStorage(storageCheckBytesZeroLength, checkBytes, "Sanity check should be checking different length bytes arrays out. (Storage)");
    }

    /**
    * Slice Tests
    */

    function testSlice() public {
        bytes memory memBytes = hex"f00d0000000000000000000000000000000000000000000000000000000000feedf00d00000000000000000000000000000000000000000000000000000000feed";

        bytes memory testBytes;
        bytes memory resultBytes;

        testBytes = hex"f00d";
        resultBytes = memBytes.slice(0,2);
        AssertBytes.equal(resultBytes, testBytes, "Normal slicing array failed.");

        testBytes = hex"";
        resultBytes = memBytes.slice(1,0);
        AssertBytes.equal(resultBytes, testBytes, "Slicing with zero-length failed.");

        testBytes = hex"";
        resultBytes = memBytes.slice(0,0);
        AssertBytes.equal(resultBytes, testBytes, "Slicing with zero-length on index 0 failed.");

        testBytes = hex"feed";
        resultBytes = memBytes.slice(31,2);
        AssertBytes.equal(resultBytes, testBytes, "Slicing across the 32-byte slot boundary failed.");

        testBytes = hex"f00d0000000000000000000000000000000000000000000000000000000000feed";
        resultBytes = memBytes.slice(0,33);
        AssertBytes.equal(resultBytes, testBytes, "Full length slice failed.");

        testBytes = hex"f00d0000000000000000000000000000000000000000000000000000000000fe";
        resultBytes = memBytes.slice(0,32);
        AssertBytes.equal(resultBytes, testBytes, "Multiple of 32 bytes slice failed.");

        testBytes = hex"f00d0000000000000000000000000000000000000000000000000000000000feedf00d00000000000000000000000000000000000000000000000000000000fe";
        resultBytes = memBytes.slice(0,64);
        AssertBytes.equal(resultBytes, testBytes, "Multiple (*2) of 32 bytes slice failed.");

        // With v0.5.x we can now entirely replace the ThrowProxy patterns that was creating issues with the js-vm
        // and use an external call to our own contract with the function selector, since Solidity now gives us
        // access to those
        bool r;

        // We're basically calling our contract externally with a raw call, forwarding all available gas, with
        // msg.data equal to the throwing function selector that we want to be sure throws and using only the boolean
        // value associated with the message call's success
        (r, ) = address(this).call(abi.encodePacked(this.sliceIndexThrow.selector));
        Assert.isFalse(r, "Slicing with wrong index should throw");

        (r, ) = address(this).call(abi.encodePacked(this.sliceLengthThrow.selector));
        Assert.isFalse(r, "Slicing with wrong length should throw");
    }

    function sliceIndexThrow() public pure {
        bytes memory memBytes33 = hex"f00d0000000000000000000000000000000000000000000000000000000000feed";

        bytes memory testBytes;
        bytes memory resultBytes;

        testBytes = hex"f00d";
        resultBytes = memBytes33.slice(34,2);
        // This should throw;
    }

    function sliceLengthThrow() public pure {
        bytes memory memBytes33 = hex"f00d0000000000000000000000000000000000000000000000000000000000feed";

        bytes memory testBytes;
        bytes memory resultBytes;

        testBytes = hex"f00d";
        resultBytes = memBytes33.slice(0,34);
        // This should throw;
    }

    function testToUint8() public {
        bytes memory memBytes = hex"f00d20feed";

        uint8 testUint8 = 32; // 0x20 == 32
        uint8 resultUint8;

        resultUint8 = memBytes.toUint8(2);
        Assert.equal(uint256(resultUint8), uint256(testUint8), "Typecast to 8-bit-wide unsigned integer failed.");

        // Testing for the throw conditions below
        (bool r, ) = address(this).call(abi.encodePacked(this.toUint8Throw.selector));
        Assert.isFalse(r, "Typecasting with wrong index should throw");
    }

    function toUint8Throw() public pure {
        bytes memory memBytes = hex"f00d42feed";

        uint8 resultUint8;

        resultUint8 = memBytes.toUint8(35);
        // This should throw;
    }

    function testToUint16() public {
        bytes memory memBytes = hex"f00d0020feed";

        uint16 testUint16 = 32; // 0x20 == 32
        uint16 resultUint16;

        resultUint16 = memBytes.toUint16(2);
        Assert.equal(uint256(resultUint16), uint256(testUint16), "Typecast to 16-bit-wide unsigned integer failed.");

        // Testing for the throw conditions below
        (bool r, ) = address(this).call(abi.encodePacked(this.toUint16Throw.selector));
        Assert.isFalse(r, "Typecasting with wrong index should throw");
    }

    function toUint16Throw() public pure {
        bytes memory memBytes = hex"f00d0042feed";

        uint16 resultUint16;

        resultUint16 = memBytes.toUint16(35);
        // This should throw;
    }
}
