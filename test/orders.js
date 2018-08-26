const BigNumber = web3.BigNumber

require("chai")
    .use(require("chai-as-promised"))
    .use(require('chai-bignumber')(BigNumber))
    .should()

let Helper = require("./helper.js");

const Orders = artifacts.require("Orders");

contract('Orders', async (accounts) => {

    beforeEach('setup contract for each test', async () => {
        user1 = accounts[0];
        user2 = accounts[1];
        orders = await Orders.new();
    });

    it("should allocate ids for orders", async () => {
        let firstId = await allocateIds(3);

        firstId.should.be.bignumber.not.equal(await orders.HEAD_ID());
        firstId.should.be.bignumber.not.equal(await orders.TAIL_ID());
    });

    it("should allocate different ids for orders", async () => {
        let firstAllocationfirstId = (await allocateIds(3)).toNumber();
        let secondAllocationfirstId = (await allocateIds(3)).toNumber();

        let firstAllocationIds = new Set([
            firstAllocationfirstId,
            firstAllocationfirstId + 1,
            firstAllocationfirstId + 2
        ]);

        let secondAllocationIds = new Set([
            secondAllocationfirstId,
            secondAllocationfirstId + 1,
            secondAllocationfirstId + 2
        ]);

        firstAllocationIds.should.not.have.any.keys(Array.from(secondAllocationIds));
        secondAllocationIds.should.not.have.any.keys(Array.from(firstAllocationIds));
    });

    it("should allocate different ids for orders of different sizes", async () => {
        let firstAllocationfirstId = (await allocateIds(5)).toNumber();
        let secondAllocationfirstId = (await allocateIds(3)).toNumber();

        let firstAllocationIds = new Set([
            firstAllocationfirstId,
            firstAllocationfirstId + 1,
            firstAllocationfirstId + 2,
            firstAllocationfirstId + 3,
            firstAllocationfirstId + 4
        ]);

        let secondAllocationIds = new Set([
            secondAllocationfirstId,
            secondAllocationfirstId + 1,
            secondAllocationfirstId + 2
        ]);

        firstAllocationIds.should.not.have.any.keys(Array.from(secondAllocationIds));
        secondAllocationIds.should.not.have.any.keys(Array.from(firstAllocationIds));
    });

    it("should have deployed the contract", async () => {
        orders.should.exist
    });

    it("should have head in id 1", async () => {
        const headId = await orders.HEAD_ID();

        headId.should.be.bignumber.equal(1);
    });

    it("should have tail in id 0", async () => {
        const tailId = await orders.TAIL_ID();

        tailId.should.be.bignumber.equal(0);
    });

    it("head should initially point to tail as its nextId", async () => {
        let head = await getOrderById(await orders.HEAD_ID());

        head.nextId.should.be.bignumber.equal(await orders.TAIL_ID());
    });

    it("should add order and get its data back with user as maker", async () => {
        let order = await addOrder(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */
        );

        order.maker.should.equal(user1);
        order.srcAmount.should.be.bignumber.equal(10);
        order.dstAmount.should.be.bignumber.equal(100);
    });

    it("should add single order so that head is its prev and tail is its next", async () => {
        let order = await addOrder(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */
        );

        order.prevId.should.be.bignumber.equal(await orders.HEAD_ID());
        order.nextId.should.be.bignumber.equal(await orders.TAIL_ID());
    });

    it("should add two orders and get the data back with users as makers", async () => {
        let order1 = await addOrder(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */
        );
        let order2 = await addOrder(
            user2 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */
        );

        order1.maker.should.equal(user1);
        order1.srcAmount.should.be.bignumber.equal(10);
        order1.dstAmount.should.be.bignumber.equal(100);
        order2.maker.should.equal(user2);
        order2.srcAmount.should.be.bignumber.equal(10);
        order2.dstAmount.should.be.bignumber.equal(200);
    });

    it("should return order maker from a different user", async () => {
        let orderId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */,
            {from: user1}
        );

        let params = await orders.getOrderDetails(orderId, {from: user2});
        let [maker,,,,] = params;

        maker.should.equal(user1);
    });

    it("should add two orders so that -> HEAD <-> first <-> second <-> TAIL", async () => {
        let id1 = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);
        let id2 = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        let head = await getOrderById(await orders.HEAD_ID());
        let order1 = await getOrderById(id1)
        let order2 = await getOrderById(id2)
        // HEAD -> 1 -> 2 -> TAIL
        head.nextId.should.be.bignumber.equal(order1.id);
        order1.nextId.should.be.bignumber.equal(order2.id);
        order2.nextId.should.be.bignumber.equal(await orders.TAIL_ID());
        // HEAD <- 1 <- 2
        order2.prevId.should.be.bignumber.equal(order1.id);
        order1.prevId.should.be.bignumber.equal(head.id);
    });

    it("should add orders according to sorting algorithm", async () => {
        let worseId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */
        );
        let betterId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */
        );

        let head = await getOrderById(await orders.HEAD_ID());
        let worse = await getOrderById(worseId);
        let better = await getOrderById(betterId);
        // HEAD -> better -> worse -> TAIL
        head.nextId.should.be.bignumber.equal(better.id);
        better.nextId.should.be.bignumber.equal(worse.id);
        worse.nextId.should.be.bignumber.equal(await orders.TAIL_ID());
        // HEAD <- better <- worse
        worse.prevId.should.be.bignumber.equal(better.id);
        better.prevId.should.be.bignumber.equal(head.id);
    });

    it("should calculate order sort key", async () => {
        worse = await orders.calculateOrderSortKey(
            10 /* srcAmount */,
            100 /* dstAmount */
        );
        better = await orders.calculateOrderSortKey(
            10 /* srcAmount */,
            200 /* dstAmount */
        );

        better.should.be.bignumber.greaterThan(worse);
    });

    it("find order prev in empty list", async () => {
        let srcAmount = 10;
        let dstAmount = 100;
        let prevId = await orders.findPrevOrderId(srcAmount, dstAmount);

        prevId.should.be.bignumber.equal(await orders.HEAD_ID());
    });

    it("find order prev in list with one better order", async () => {
        let betterId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */
        );

        let srcAmount = 10;
        let dstAmount = 100;
        let prevId = await orders.findPrevOrderId(srcAmount, dstAmount);

        prevId.should.be.bignumber.equal(betterId);
    });

    it("find order prev in list with one worse order", async () => {
        let worseId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */
        );

        let srcAmount = 10;
        let dstAmount = 200;
        let prevId = await orders.findPrevOrderId(srcAmount, dstAmount);

        prevId.should.be.bignumber.equal(await orders.HEAD_ID());
    });

    it("find order prev in list with a worse order and a better one", async () => {
        let betterId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */
        );
        let worseId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */
        );

        let srcAmount = 10;
        let dstAmount = 200;
        let prevId = await orders.findPrevOrderId(srcAmount, dstAmount);

        prevId.should.be.bignumber.equal(betterId);
    });

    it("add order to an empty list", async () => {
        let order = await addOrder(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */
        );

        let head = await getOrderById(await orders.HEAD_ID());
        head.nextId.should.be.bignumber.equal(order.id);
        order.nextId.should.be.bignumber.equal(await orders.TAIL_ID());
        order.prevId.should.be.bignumber.equal(await orders.HEAD_ID());
    });

    it("add order to list after better order", async () => {
        let betterId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */
        );

        let order = await addOrder(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */
        );

        let head = await getOrderById(await orders.HEAD_ID());
        let better = await getOrderById(betterId);
        // HEAD -> better -> order -> TAIL
        head.nextId.should.be.bignumber.equal(better.id);
        better.nextId.should.be.bignumber.equal(order.id);
        order.nextId.should.be.bignumber.equal(await orders.TAIL_ID());
        // HEAD <- better <- order
        order.prevId.should.be.bignumber.equal(better.id);
        better.prevId.should.be.bignumber.equal(await orders.HEAD_ID());
    });

    it("add order to list before worse order", async () => {
        let worseId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */
        );

        let order = await addOrder(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */
        );

        let head = await getOrderById(await orders.HEAD_ID());
        let worse = await getOrderById(worseId);
        // HEAD -> order -> worse -> TAIL
        head.nextId.should.be.bignumber.equal(order.id);
        order.nextId.should.be.bignumber.equal(worse.id);
        worse.nextId.should.be.bignumber.equal(await orders.TAIL_ID());
        // HEAD <- order <- worse
        worse.prevId.should.be.bignumber.equal(order.id);
        order.prevId.should.be.bignumber.equal(await orders.HEAD_ID());
    });

    it("add order to list between better and worse ones", async () => {
        let worseId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */
        );
        let betterId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */
        );

        let order = await addOrder(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */
        );

        let head = await getOrderById(await orders.HEAD_ID());
        let better = await getOrderById(betterId);
        let worse = await getOrderById(worseId);
        // HEAD -> better -> order -> worse -> TAIL
        head.nextId.should.be.bignumber.equal(better.id);
        better.nextId.should.be.bignumber.equal(order.id);
        order.nextId.should.be.bignumber.equal(worse.id);
        worse.nextId.should.be.bignumber.equal(await orders.TAIL_ID());
        // HEAD <- better <- order <- worse
        worse.prevId.should.be.bignumber.equal(order.id);
        order.prevId.should.be.bignumber.equal(better.id);
        better.prevId.should.be.bignumber.equal(await orders.HEAD_ID());
    });

    it("add order after a specified order id", async () => {
        let worseId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */
        );
        let betterId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */
        );

        let order = await addOrderAfterId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */,
            betterId
        );

        let head = await getOrderById(await orders.HEAD_ID());
        let better = await getOrderById(betterId);
        let worse = await getOrderById(worseId);
        // HEAD -> better -> order -> worse -> TAIL
        head.nextId.should.be.bignumber.equal(better.id);
        better.nextId.should.be.bignumber.equal(order.id);
        order.nextId.should.be.bignumber.equal(worse.id);
        worse.nextId.should.be.bignumber.equal(await orders.TAIL_ID());
        // HEAD <- better <- order <- worse
        worse.prevId.should.be.bignumber.equal(order.id);
        order.prevId.should.be.bignumber.equal(better.id);
        better.prevId.should.be.bignumber.equal(await orders.HEAD_ID());
    });

    it("should reject adding after invalid order id: non-existant", async () => {
        let id = await allocateIds(1);

        // Calling locally so that the order will not be in fact added to the
        // list and thus the id will be invalid.
        let nonExistantOrderId = await orders.allocateIds.call(1);

        try {
            let order = await orders.addAfterId(
                user1 /* maker */,
                id /* orderId */,
                10 /* srcAmount */,
                200 /* dstAmount */,
                nonExistantOrderId
            );
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(
                Helper.isRevertErrorMessage(e),
                "expected revert but got: " + e);
        }
    });

    it("should reject adding after invalid order id: is TAIL", async () => {
        try {
            let order = await addOrderAfterId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */,
                // TAIL is technically a non-existant order, as the ID used for
                // it should not have an order in it, but the verification was
                // added to make this requirement explicit.
                await orders.TAIL_ID()
            );
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(
                Helper.isRevertErrorMessage(e),
                "expected revert but got: " + e);
        }
    });

    it("should reject adding after invalid order id: after worse order", async () => {
        let worseId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */
        );

        try {
            let order = await addOrderAfterId(
                user1 /* maker */,
                10 /* srcAmount */,
                200 /* dstAmount */,
                worseId);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(
                Helper.isRevertErrorMessage(e),
                "expected revert but got: " + e);
        }
    });

    it("should reject adding after invalid order id: before better order", async () => {
        let bestId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */
        );
        let betterId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */
        );

        try {
            let order = await addOrderAfterId(
                user1 /* maker */,
                10 /* srcAmount */,
                100 /* dstAmount */,
                bestId);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(
                Helper.isRevertErrorMessage(e),
                "expected revert but got: " + e);
        }
    });

    it("remove order removes from list but does not delete order", async () => {
        let orderId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        await orders.removeById(orderId);

        let order = await getOrderById(orderId);
        order.maker.should.be.bignumber.equal(user1);
        order.srcAmount.should.be.bignumber.equal(10);
        order.dstAmount.should.be.bignumber.equal(100);
    });

    it("removing all orders from list: starting with highest", async () => {
        let worseId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);
        let betterId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);

        await orders.removeById(worseId);
        await orders.removeById(betterId);

        // Removed from linked list
        let head = await getOrderById(await orders.HEAD_ID());
        head.nextId.should.be.bignumber.equal(await orders.TAIL_ID());
    });

    it("remove all orders from list: starting with lowest", async () => {
        let worseId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);
        let betterId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);

        await orders.removeById(betterId);
        await orders.removeById(worseId);

        // Removed from linked list
        let head = await getOrderById(await orders.HEAD_ID());
        head.nextId.should.be.bignumber.equal(await orders.TAIL_ID());
    });

    it("remove order from list maintains order: last order", async () => {
        let worseId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);
        let betterId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);

        await orders.removeById(worseId);

        // Removed from linked list
        let head = await getOrderById(await orders.HEAD_ID());
        let better = await getOrderById(betterId);
        // HEAD -> better -> TAIL
        head.nextId.should.be.bignumber.equal(better.id);
        better.nextId.should.be.bignumber.equal(await orders.TAIL_ID());
        // HEAD <- better
        better.prevId.should.be.bignumber.equal(head.id);
    });

    it("remove order from list maintains order: first order", async () => {
        let worseId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);
        let betterId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);

        await orders.removeById(betterId);

        // Removed from linked list
        let head = await getOrderById(await orders.HEAD_ID());
        let worse = await getOrderById(worseId);
        // HEAD -> worse -> TAIL
        head.nextId.should.be.bignumber.equal(worse.id);
        worse.nextId.should.be.bignumber.equal(await orders.TAIL_ID());
        // HEAD <- worse
        worse.prevId.should.be.bignumber.equal(head.id);
    });

    it("remove order from list maintains order: middle order", async () => {
        let worseId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);
        let middleId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);
        let betterId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */);

        await orders.removeById(middleId);

        // Removed from linked list
        let head = await getOrderById(await orders.HEAD_ID());
        let better = await getOrderById(betterId);
        let worse = await getOrderById(worseId);
        // HEAD -> better -> worse -> TAIL
        head.nextId.should.be.bignumber.equal(better.id);
        better.nextId.should.be.bignumber.equal(worse.id);
        worse.nextId.should.be.bignumber.equal(await orders.TAIL_ID());
        // HEAD <- better <- worse
        worse.prevId.should.be.bignumber.equal(better.id);
        better.prevId.should.be.bignumber.equal(head.id);
    });

    it("should reject removing HEAD", async () => {
        try {
            await orders.removeById(await orders.HEAD_ID());
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(
                Helper.isRevertErrorMessage(e),
                "expected revert but got: " + e);
        }
    });

    it("should reject removing non-existant id", async () => {
        // Calling locally so that the order will not be in fact added to the
        // list and thus the id will be invalid.
        let nonExistantOrderId = await orders.allocateIds.call(1);

        try {
            await orders.removeById(nonExistantOrderId);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(
                Helper.isRevertErrorMessage(e),
                "expected revert but got: " + e);
        }
    });

    it("should update order contents with new amounts ", async () => {
        let orderId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        let srcAmount = 20;
        let dstAmount = 200;
        let newOrderId = await update(orderId, srcAmount, dstAmount);

        let order = await getOrderById(newOrderId);
        order.maker.should.equal(user1);
        order.srcAmount.should.be.bignumber.equal(srcAmount);
        order.dstAmount.should.be.bignumber.equal(dstAmount);
    });

    it("should keep correct order position following update: first -> first", async () => {
        // before: HEAD -> first -> second -> third -> TAIL
        let firstId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */);
        let secondId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);
        let thirdId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        let srcAmount = 10;
        let dstAmount = 330;
        let updatedId = await update(firstId, srcAmount, dstAmount);

        // Removed from linked list
        let head = await getOrderById(await orders.HEAD_ID());
        let updated = await getOrderById(updatedId);
        let second = await getOrderById(secondId);
        let third = await getOrderById(thirdId);
        // after: HEAD -> Updated -> second -> third -> TAIL
        head.nextId.should.be.bignumber.equal(updated.id);
        updated.nextId.should.be.bignumber.equal(second.id);
        second.nextId.should.be.bignumber.equal(third.id);
        third.nextId.should.be.bignumber.equal(await orders.TAIL_ID());
        // after: HEAD <- Updated <- second <- third
        third.prevId.should.be.bignumber.equal(second.id);
        second.prevId.should.be.bignumber.equal(updated.id);
        updated.prevId.should.be.bignumber.equal(head.id);
    });

    it("should keep correct order position following update: first -> second", async () => {
        // before: HEAD -> first -> second -> third -> TAIL
        let firstId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */);
        let secondId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);
        let thirdId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        let srcAmount = 10;
        let dstAmount = 130;
        let updatedId = await update(firstId, srcAmount, dstAmount);

        // Removed from linked list
        let head = await getOrderById(await orders.HEAD_ID());
        let updated = await getOrderById(updatedId);
        let second = await getOrderById(secondId);
        let third = await getOrderById(thirdId);
        // after: HEAD -> second -> Updated -> third -> TAIL
        head.nextId.should.be.bignumber.equal(second.id);
        second.nextId.should.be.bignumber.equal(updated.id);
        updated.nextId.should.be.bignumber.equal(third.id);
        third.nextId.should.be.bignumber.equal(await orders.TAIL_ID());
        // after: HEAD <- second <- Updated <- third
        third.prevId.should.be.bignumber.equal(updated.id);
        updated.prevId.should.be.bignumber.equal(second.id);
        second.prevId.should.be.bignumber.equal(head.id);
    });

    it("should keep correct order position following update: first -> third", async () => {
        // before: HEAD -> first -> second -> third -> TAIL
        let firstId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */);
        let secondId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);
        let thirdId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        let srcAmount = 10;
        let dstAmount = 30;
        let updatedId = await update(firstId, srcAmount, dstAmount);

        // Removed from linked list
        let head = await getOrderById(await orders.HEAD_ID());
        let updated = await getOrderById(updatedId);
        let second = await getOrderById(secondId);
        let third = await getOrderById(thirdId);
        // after: HEAD -> second -> third -> Updated -> TAIL
        head.nextId.should.be.bignumber.equal(second.id);
        second.nextId.should.be.bignumber.equal(third.id);
        third.nextId.should.be.bignumber.equal(updated.id);
        updated.nextId.should.be.bignumber.equal(await orders.TAIL_ID());
        // after: HEAD <- second <- third <- Updated
        updated.prevId.should.be.bignumber.equal(third.id);
        third.prevId.should.be.bignumber.equal(second.id);
        second.prevId.should.be.bignumber.equal(head.id);
    });

    it("should keep correct order position following update: second -> first", async () => {
        // before: HEAD -> first -> second -> third -> TAIL
        let firstId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */);
        let secondId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);
        let thirdId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        let srcAmount = 10;
        let dstAmount = 320;
        let updatedId = await update(secondId, srcAmount, dstAmount);

        // Removed from linked list
        let head = await getOrderById(await orders.HEAD_ID());
        let first = await getOrderById(firstId);
        let updated = await getOrderById(updatedId);
        let third = await getOrderById(thirdId);
        // after: HEAD -> Updated -> first -> third -> TAIL
        head.nextId.should.be.bignumber.equal(updated.id);
        updated.nextId.should.be.bignumber.equal(first.id);
        first.nextId.should.be.bignumber.equal(third.id);
        third.nextId.should.be.bignumber.equal(await orders.TAIL_ID());
        // after: HEAD <- Updated <- first <- third
        third.prevId.should.be.bignumber.equal(first.id);
        first.prevId.should.be.bignumber.equal(updated.id);
        updated.prevId.should.be.bignumber.equal(head.id);
    });

    it("should keep correct order position following update: second -> second", async () => {
        // before: HEAD -> first -> second -> third -> TAIL
        let firstId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */);
        let secondId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);
        let thirdId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        let srcAmount = 10;
        let dstAmount = 220;
        let updatedId = await update(secondId, srcAmount, dstAmount);

        // Removed from linked list
        let head = await getOrderById(await orders.HEAD_ID());
        let first = await getOrderById(firstId);
        let updated = await getOrderById(updatedId);
        let third = await getOrderById(thirdId);
        // after: HEAD -> first -> Updated -> third -> TAIL
        head.nextId.should.be.bignumber.equal(first.id);
        first.nextId.should.be.bignumber.equal(updated.id);
        updated.nextId.should.be.bignumber.equal(third.id);
        third.nextId.should.be.bignumber.equal(await orders.TAIL_ID());
        // after: HEAD <- first <- Updated <- third
        third.prevId.should.be.bignumber.equal(updated.id);
        updated.prevId.should.be.bignumber.equal(first.id);
        first.prevId.should.be.bignumber.equal(head.id);
    });

    it("should keep correct order position following update: second -> third", async () => {
        // before: HEAD -> first -> second -> third -> TAIL
        let firstId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */);
        let secondId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);
        let thirdId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        let srcAmount = 10;
        let dstAmount = 20;
        let updatedId = await update(secondId, srcAmount, dstAmount);

        // Removed from linked list
        let head = await getOrderById(await orders.HEAD_ID());
        let first = await getOrderById(firstId);
        let updated = await getOrderById(updatedId);
        let third = await getOrderById(thirdId);
        // after: HEAD -> first -> third -> Updated -> TAIL
        head.nextId.should.be.bignumber.equal(first.id);
        first.nextId.should.be.bignumber.equal(third.id);
        third.nextId.should.be.bignumber.equal(updated.id);
        updated.nextId.should.be.bignumber.equal(await orders.TAIL_ID());
        // after: HEAD <- first <- third <- Updated
        updated.prevId.should.be.bignumber.equal(third.id);
        third.prevId.should.be.bignumber.equal(first.id);
        first.prevId.should.be.bignumber.equal(head.id);
    });

    it("should keep correct order position following update: third -> first", async () => {
        // before: HEAD -> first -> second -> third -> TAIL
        let firstId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */);
        let secondId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);
        let thirdId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        let srcAmount = 10;
        let dstAmount = 310;
        let updatedId = await update(thirdId, srcAmount, dstAmount);

        // Removed from linked list
        let head = await getOrderById(await orders.HEAD_ID());
        let first = await getOrderById(firstId);
        let second = await getOrderById(secondId);
        let updated = await getOrderById(updatedId);
        // after: HEAD -> Updated -> first -> second -> TAIL
        head.nextId.should.be.bignumber.equal(updated.id);
        updated.nextId.should.be.bignumber.equal(first.id);
        first.nextId.should.be.bignumber.equal(second.id);
        second.nextId.should.be.bignumber.equal(await orders.TAIL_ID());
        // after: HEAD <- Updated <- first <- second
        second.prevId.should.be.bignumber.equal(first.id);
        first.prevId.should.be.bignumber.equal(updated.id);
        updated.prevId.should.be.bignumber.equal(head.id);
    });

    it("should keep correct order position following update: third -> second", async () => {
        // before: HEAD -> first -> second -> third -> TAIL
        let firstId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */);
        let secondId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);
        let thirdId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        let srcAmount = 10;
        let dstAmount = 210;
        let updatedId = await update(thirdId, srcAmount, dstAmount);

        // Removed from linked list
        let head = await getOrderById(await orders.HEAD_ID());
        let first = await getOrderById(firstId);
        let second = await getOrderById(secondId);
        let updated = await getOrderById(updatedId);
        // after: HEAD -> first -> Updated -> second -> TAIL
        head.nextId.should.be.bignumber.equal(first.id);
        first.nextId.should.be.bignumber.equal(updated.id);
        updated.nextId.should.be.bignumber.equal(second.id);
        second.nextId.should.be.bignumber.equal(await orders.TAIL_ID());
        // after: HEAD <- first <- Updated <- second
        second.prevId.should.be.bignumber.equal(updated.id);
        updated.prevId.should.be.bignumber.equal(first.id);
        first.prevId.should.be.bignumber.equal(head.id);
    });

    it("should keep correct order position following update: third -> third", async () => {
        // before: HEAD -> first -> second -> third -> TAIL
        let firstId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */);
        let secondId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);
        let thirdId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        let srcAmount = 10;
        let dstAmount = 10;
        let updatedId = await update(thirdId, srcAmount, dstAmount);

        // Removed from linked list
        let head = await getOrderById(await orders.HEAD_ID());
        let first = await getOrderById(firstId);
        let second = await getOrderById(secondId);
        let updated = await getOrderById(updatedId);
        // after: HEAD -> first -> second -> Updated -> TAIL
        head.nextId.should.be.bignumber.equal(first.id);
        first.nextId.should.be.bignumber.equal(second.id);
        second.nextId.should.be.bignumber.equal(updated.id);
        updated.nextId.should.be.bignumber.equal(await orders.TAIL_ID());
        // after: HEAD <- first <- second <- Updated
        updated.prevId.should.be.bignumber.equal(second.id);
        second.prevId.should.be.bignumber.equal(first.id);
        first.prevId.should.be.bignumber.equal(head.id);
    });

    it("should update order contents with new amounts to given position: values", async () => {
        // before: HEAD -> first -> second -> third -> TAIL
        let firstId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */);
        let secondId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);
        let thirdId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        let srcAmount = 10;
        let dstAmount = 210;
        let updatedId = await updateWithPositionHint(
            thirdId /* orderId */,
            srcAmount /* srcAmount */,
            dstAmount /* dstAmount */,
            firstId /* prevId */
        );

        // Removed from linked list
        let head = await getOrderById(await orders.HEAD_ID());
        let first = await getOrderById(firstId);
        let second = await getOrderById(secondId);
        let updated = await getOrderById(updatedId);
        updated.maker.should.equal(user1);
        updated.srcAmount.should.be.bignumber.equal(srcAmount);
        updated.dstAmount.should.be.bignumber.equal(dstAmount);
    });

    it("should update order contents with new amounts to given position: order", async () => {
        // before: HEAD -> first -> second -> third -> TAIL
        let firstId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */);
        let secondId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);
        let thirdId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        let srcAmount = 10;
        let dstAmount = 210;
        let updatedId = await updateWithPositionHint(
            thirdId /* orderId */,
            srcAmount /* srcAmount */,
            dstAmount /* dstAmount */,
            firstId /* prevId */
        );

        // Removed from linked list
        let head = await getOrderById(await orders.HEAD_ID());
        let first = await getOrderById(firstId);
        let second = await getOrderById(secondId);
        let updated = await getOrderById(updatedId);
        // after: HEAD -> first -> Updated -> second -> TAIL
        head.nextId.should.be.bignumber.equal(first.id);
        first.nextId.should.be.bignumber.equal(updated.id);
        updated.nextId.should.be.bignumber.equal(second.id);
        second.nextId.should.be.bignumber.equal(await orders.TAIL_ID());
        // after: HEAD <- first <- Updated <- second
        second.prevId.should.be.bignumber.equal(updated.id);
        updated.prevId.should.be.bignumber.equal(first.id);
        first.prevId.should.be.bignumber.equal(head.id);
    });

    it("should support getOrderData", async () => {
        let order = await addOrder(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */
        );

        let params = await orders.getOrderData(order.id);
        let [nextOrderId, srcAmount, dstAmount, isLastOrder] = params;

        nextOrderId.should.be.bignumber.equal(await orders.TAIL_ID());
        srcAmount.should.be.bignumber.equal(10);
        dstAmount.should.be.bignumber.equal(200);
        isLastOrder.should.equal(true);
    });

    it("should return first order id with getFirstOrder ", async () => {
        let order = await addOrder(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */
        );

        let params = await orders.getFirstOrder();
        let [firstOrderId, isEmpty] = params;

        firstOrderId.should.be.bignumber.equal(order.id);
        isEmpty.should.equal(false);
    });

    it("should return empty if called with getFirstOrder when no order", async () => {
        let params = await orders.getFirstOrder();
        let [firstOrderId, isEmpty] = params;

        isEmpty.should.equal(true);
    });

    // TODO: add without position to a long list fails
    // TODO: update without new position to a long list fails
});

class Order {
    constructor(id, maker, srcAmount, dstAmount, prevId, nextId) {
        this.id = id;
        this.maker = maker;
        this.srcAmount = srcAmount;
        this.dstAmount = dstAmount;
        this.prevId = prevId;
        this.nextId = nextId;
    }
}

async function getOrderById(id) {
    let params = await orders.getOrderDetails(id);
    let [maker, srcAmount, dstAmount, prevId, nextId] = params;
    return new Order(id, maker, srcAmount, dstAmount, prevId, nextId);
}

async function addOrderGetId(maker, srcAmount, dstAmount, args = {}) {
    let orderId = await allocateIds(1);
    await orders.add(maker, orderId, srcAmount, dstAmount, args);
    return orderId;
}

async function addOrderAfterIdGetId(
    maker,
    srcAmount,
    dstAmount,
    prevId,
    args = {}
)
{
    let orderId = await allocateIds(1);
    await orders.addAfterId(
        user1 /* maker */,
        orderId,
        srcAmount,
        dstAmount,
        prevId,
        args
    );
    return orderId;
}

async function addOrder(maker, srcAmount, dstAmount, args = {}) {
    let orderId = await addOrderGetId(maker, srcAmount, dstAmount, args);
    return await getOrderById(orderId);
}

async function addOrderAfterId(maker, srcAmount, dstAmount, prevId, args = {}) {
    let id = await addOrderAfterIdGetId(
            maker, srcAmount, dstAmount, prevId, args);
    return await getOrderById(id);
}

async function update(orderId, srcAmount, dstAmount, args = {}) {
    let newId = await orders.update.call(orderId, srcAmount, dstAmount);
    await orders.update(orderId, srcAmount, dstAmount);
    return newId;
}

async function updateWithPositionHint(
    orderId,
    srcAmount,
    dstAmount,
    prevId,
    args = {}
)
{
    let newId = await orders.updateWithPositionHint.call(
        orderId, srcAmount, dstAmount, prevId);
    await orders.updateWithPositionHint(orderId, srcAmount, dstAmount, prevId);
    return newId;
}

async function allocateIds(howMany) {
    let firstId = await orders.allocateIds.call(howMany);
    await orders.allocateIds(howMany);
    return firstId;
}
