const { UserMetrics, sequelize } = require('../models'); // Import Sequelize instance

const { Op } = require('sequelize');
const { getIo } = require('../socket/socket');
const { saveNotification } = require('./NotificationServices');

const updateUserMetric = async (userId, column, incrementBy, transaction) => {
    const io = getIo();
    try {
        const today = new Date().toISOString().split('T')[0]; // Get today's date (YYYY-MM-DD)

        // Allowed columns for dynamic update
        const allowedColumns = ['calls_done', 'interested', 'walk_ins', 'assigned_calls', 'connected_calls'];
        if (!allowedColumns.includes(column)) {
            throw new Error('Invalid column name');
        }

        // Ensure the transaction exists
        if (!transaction) {
            throw new Error('Transaction is required');
        }

        // Find or create today's record
        let [userMetric, created] = await UserMetrics.findOrCreate({
            where: { user_id: userId, date: today },
            defaults: { calls_done: 0, interested: 0, walk_ins: 0, assigned_calls: 0 },
            transaction,
        });

        // Increment the given column inside transaction
        await userMetric.increment(column, { by: incrementBy, transaction });

        // Fetch updated values after incrementing
        const updatedMetric = await UserMetrics.findOne({ 
            where: { user_id: userId, date: today }, 
            transaction 
        });

        // Commit transaction only if it's still active
        // if (!transaction.finished) {
        //     await transaction.commit();
        // }

        // io.to(`user_${userId}`).emit('completed_50_calls', { message: 'Fantastic! You reached 50 calls—keep up the momentum!' });
        // Emit events when threshold is met
        if (updatedMetric.walk_ins >= 3) {
            io.emit('high_intent_visitors', { message: 'You got 3+ High Intent Visitors. Fantastic work!' });
        }
        if (updatedMetric.interested === 3) {
            io.to(`user_${userId}`).emit('high_interested_leads', { message: '3+ Impressive effort! Looking forward to seeing the great results unfold!' });
        }
        if (updatedMetric.connected_calls === 50) {
            io.to(`user_${userId}`).emit('connected_50_calls', { message: 'Fantastic! You reached 50 calls—keep up the momentum!' });
            // await saveNotification({employee_id:userId, message:`completed_50_calls - Fantastic! You reached 50 calls—keep up the momentum!`, is_interactive:true}, transaction)
        }
        if (updatedMetric.connected_calls === 100) {
            io.to(`user_${userId}`).emit('connected_100_calls', { message: 'Great job! You successfully completed your target today!' });
        }
        if (updatedMetric.calls_done === updatedMetric.assigned_calls) {
            io.to(`user_${userId}`).emit('completed_all_calls', { message: 'Good work! You successfully wrapped up all your leads for the day!' });
        }

        return { success: true, updatedMetric };

    } catch (error) {
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }
        console.error('Error updating user metric:', error);
        throw new Error(error.message);
    }
};

const updateWeeklyWalkIns = async (userId, incrementBy = 1, transaction) => {
    try {
        const today = new Date();
        const dayOfWeek = today.getDay();

        // If today is Sunday (0), don't update walk_ins
        if (dayOfWeek === 0) {
            throw new Error('Cannot update walk_ins on Sunday');
        }

        const todayDate = today.toISOString().split('T')[0]; // Format: YYYY-MM-DD

        // Ensure transaction exists
        if (!transaction) {
            throw new Error('Transaction is required');
        }

        // Find or create today's record
        let [userMetric, created] = await UserMetrics.findOrCreate({
            where: { user_id: userId, date: todayDate },
            defaults: { walk_ins: 0, calls_done: 0, interested: 0, assigned_calls: 0 },
            transaction,
        });

        // Increment the walk_ins column inside the transaction
        await userMetric.increment('walk_ins', { by: incrementBy, transaction });

        return { success: true, updatedWalkIns: userMetric.walk_ins + incrementBy };
    } catch (error) {
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }
        console.error('Error updating walk-ins:', error);
        throw new Error(error.message);
    }
};

module.exports = { updateUserMetric, updateWeeklyWalkIns };
