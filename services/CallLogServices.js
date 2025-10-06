const { Op } = require("sequelize");
const { CallLog, sequelize, Lead, User } = require("../models");
const { callTypes, callStatuses } = require("../utilities/constants");

function buildDateFilter(startDate, endDate, timePeriod) {
  // If no date parameters provided, return empty condition for all data
  if (!startDate && !endDate && !timePeriod) {
    return {
      start: null,
      end: null,
      condition: {} // Empty condition will fetch all data
    };
  }

  let start, end;
  const now = new Date();

  if (startDate && endDate) {
    // Use provided date range
    start = new Date(startDate);
    end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // End of day
  } else {
    // Use predefined time period
    switch (timePeriod) {
      case 'today':
        start = new Date(now.setHours(0, 0, 0, 0));
        end = new Date(now.setHours(23, 59, 59, 999));
        break;
      case 'yesterday':
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        start = new Date(yesterday.setHours(0, 0, 0, 0));
        end = new Date(yesterday.setHours(23, 59, 59, 999));
        break;
      case 'week':
        start = new Date(now.setDate(now.getDate() - 7));
        end = new Date();
        break;
      case 'month':
        start = new Date(now.setMonth(now.getMonth() - 1));
        end = new Date();
        break;
      default:
        // If invalid time_period provided, default to all data
        return {
          start: null,
          end: null,
          condition: {}
        };
    }
  }

  return {
    start,
    end,
    condition: {
      call_timestamp: {
        [Op.between]: [start, end]
      }
    }
  };
}

function buildEmployeeFilter(employeeId) {
  if (!employeeId) return { condition: {} };

  return {
    employee_id: parseInt(employeeId),
    condition: {
      employee_id: parseInt(employeeId)
    }
  };
}

async function getKPIMetrics(dateFilter, employeeFilter, transaction){
    const whereClause = {
        ...dateFilter.condition,
        ...employeeFilter.condition,
        status: 'active'
    }

    // total calls made ( outgoing )
    const totalCallsMade = await CallLog.count({
        where: {
            ...whereClause,
            call_type: callTypes.OUTGOING
        },
        transaction
    })

    // total calls received ( incoming )
    const totalCallsReceived = await CallLog.count({
        where: {
            ...whereClause,
            call_type: callTypes.INCOMING
        },
        transaction
    })

    // connected calls ( outgoing - answered calls )
    const connectedCalls = await CallLog.count({
        where: {
            ...whereClause,
            call_type: callTypes.OUTGOING,
            call_status: callStatuses.ANSWERED
        }
    })

    // connection rate
    const connectionRate = totalCallsMade > 0
        ? ((connectedCalls / totalCallsMade) * 100).toFixed(2) + '%'
        : '0%'

    // missed calls
    const missedCalls = await CallLog.count({
        where: {
            ...whereClause,
            call_type: callTypes.MISSED,
            call_status: callStatuses.NOT_ANSWERED
        },
        transaction
    })

    // call durations
    const durationStats = await CallLog.findOne({
        attributes: [
            [sequelize.fn('AVG', sequelize.col('call_duration')), 'avg_duration'],
            [sequelize.fn('SUM', sequelize.col('call_duration')), 'total_talk_time']
        ],
        where: {
            ...whereClause,
            call_status: callStatuses.ANSWERED,
            call_duration: { [Op.gt]: 0 }
        },
        raw: true,
        transaction
    })

    const avgDurationSeconds = Math.round(durationStats?.avg_duration || 0)
    const totalTalkTimeSeconds = Math.round(durationStats?.total_talk_time || 0)

    // format duration from seconds to MM:SS
    const formatDuration = (seconds) => {
        const mins = Math.floor(seconds/60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    return {
        totalCallsMade,
        totalCallsReceived,
        connectedCalls,
        connectionRate,
        avgCallDuration:formatDuration(avgDurationSeconds),
        totalTalkTime:formatDuration(totalTalkTimeSeconds),
        missedCalls
    }
}

async function getAgentPerformance(dateFilter, employeeFilter, transaction) {
  // If specific employee filter is applied, only get that employee's data
  const employeeWhere = employeeFilter.condition.employee_id 
    ? { id: employeeFilter.condition.employee_id }
    : {};

  const agents = await User.findAll({
    attributes: ['id', 'name'],
    where: { 
      ...employeeWhere,
      status: 'active' 
    },
    transaction
  });

  const agentPerformance = await Promise.all(
    agents.map(async (agent) => {
      const whereClause = {
        ...dateFilter.condition,
        employee_id: agent.id,
        status: 'active'
      };

      // Get call statistics
      const callStats = await CallLog.findOne({
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'total_calls'],
          [sequelize.fn('SUM', sequelize.literal('CASE WHEN call_type = "OUTGOING" AND call_status = "ANSWERED" THEN 1 ELSE 0 END')), 'connected_calls'],
          [sequelize.fn('AVG', sequelize.col('call_duration')), 'avg_duration'],
          [sequelize.fn('SUM', sequelize.col('call_duration')), 'total_talk_time']
        ],
        where: whereClause,
        raw: true,
        transaction
      });

      const totalCalls = parseInt(callStats?.total_calls || 0);
      const connectedCalls = parseInt(callStats?.connected_calls || 0);
      const connectivityPercentage = totalCalls > 0 
        ? ((connectedCalls / totalCalls) * 100).toFixed(1)
        : 0;

      const avgDurationSeconds = Math.round(callStats?.avg_duration || 0);
      const totalTalkTimeSeconds = Math.round(callStats?.total_talk_time || 0);

      // Get unique leads contacted by this agent using raw query to avoid association issues
      const contactedLeads = await CallLog.findAll({
        attributes: [[sequelize.fn('DISTINCT', sequelize.col('lead_id')), 'lead_id']],
        where: whereClause,
        raw: true,
        transaction
      });

      const contactedLeadIds = contactedLeads.map(lead => lead.lead_id).filter(id => id);

      // If no leads contacted, return basic call stats
      if (contactedLeadIds.length === 0) {
        return {
          agent_name: agent.name,
          total_calls: totalCalls,
          connected_calls: connectedCalls,
          connectivity_percentage: connectivityPercentage,
          avg_call_duration: `${Math.floor(avgDurationSeconds / 60)}:${(avgDurationSeconds % 60).toString().padStart(2, '0')}`,
          talk_time: `${Math.floor(totalTalkTimeSeconds / 3600)}:${Math.floor((totalTalkTimeSeconds % 3600) / 60).toString().padStart(2, '0')}`,
          active_prospects: 0,
          conversion_rate: 0,
          total_leads_contacted: 0
        };
      }

      // Get lead metrics for the contacted leads
      const leadMetrics = await Lead.findOne({
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'total_leads'],
          [sequelize.fn('SUM', sequelize.literal('CASE WHEN lead_status = "Active Prospect" THEN 1 ELSE 0 END')), 'active_prospects'],
          [sequelize.fn('SUM', sequelize.literal('CASE WHEN application_status = "Approved" THEN 1 ELSE 0 END')), 'converted_leads']
        ],
        where: {
          id: { [Op.in]: contactedLeadIds },
          status: 'active'
        },
        raw: true,
        transaction
      });

      const totalLeadsContacted = parseInt(leadMetrics?.total_leads || 0);
      const activeProspects = parseInt(leadMetrics?.active_prospects || 0);
      const convertedLeads = parseInt(leadMetrics?.converted_leads || 0);
      
      const conversionRate = totalLeadsContacted > 0 
        ? ((convertedLeads / totalLeadsContacted) * 100).toFixed(1)
        : 0;

      return {
        name: agent.name,
        totalCalls,
        connectedCalls,
        connectivity: connectivityPercentage,
        avgDuration: `${Math.floor(avgDurationSeconds / 60)}:${(avgDurationSeconds % 60).toString().padStart(2, '0')}`,
        talkTime: `${Math.floor(totalTalkTimeSeconds / 3600)}:${Math.floor((totalTalkTimeSeconds % 3600) / 60).toString().padStart(2, '0')}`,
        prospects: activeProspects,
        conversion: conversionRate,
        total_leads_contacted: totalLeadsContacted
      };
    })
  );

  return agentPerformance.filter(agent => agent.totalCalls > 0);
}

async function getTimeAnalysis(dateFilter, employeeFilter, transaction) {
  // Define time slots for analysis in IST
  const timeSlots = [
    { start: 9, end: 10, label: '9 AM - 10 AM' },
    { start: 10, end: 11, label: '10 AM - 11 AM' },
    { start: 11, end: 12, label: '11 AM - 12 PM' },
    { start: 12, end: 13, label: '12 PM - 01 PM' },
    { start: 13, end: 14, label: '01 PM - 02 PM' },
    { start: 14, end: 15, label: '02 PM - 03 PM' },
    { start: 15, end: 16, label: '03 PM - 04 PM' },
    { start: 16, end: 17, label: '04 PM - 05 PM' },
    { start: 17, end: 18, label: '05 PM - 06 PM' },
    { start: 18, end: 19, label: '06 PM - 07 PM' },
    { start: 19, end: 9, label: '07 PM - 09 AM' } // Overnight slot
  ];

  const timeAnalysis = await Promise.all(
    timeSlots.map(async (slot) => {
      let hourCondition;

      if (slot.start < slot.end) {
        // Normal time slot (e.g., 9 AM - 10 AM)
        hourCondition = {
          [Op.and]: [
            // Since call_timestamp is in IST, we can directly use HOUR function
            sequelize.where(sequelize.fn('HOUR', sequelize.col('call_timestamp')), Op.gte, slot.start),
            sequelize.where(sequelize.fn('HOUR', sequelize.col('call_timestamp')), Op.lt, slot.end)
          ]
        };
      } else {
        // Overnight slot (e.g., 7 PM - 9 AM next day)
        hourCondition = {
          [Op.or]: [
            { [Op.and]: [
              sequelize.where(sequelize.fn('HOUR', sequelize.col('call_timestamp')), Op.gte, slot.start),
              sequelize.where(sequelize.fn('HOUR', sequelize.col('call_timestamp')), Op.lt, 24)
            ]},
            { [Op.and]: [
              sequelize.where(sequelize.fn('HOUR', sequelize.col('call_timestamp')), Op.gte, 0),
              sequelize.where(sequelize.fn('HOUR', sequelize.col('call_timestamp')), Op.lt, slot.end)
            ]}
          ]
        };
      }

      // Build the complete where clause
      const whereClause = {
        ...dateFilter.condition,
        ...employeeFilter.condition, // This includes employee_id filter if provided
        ...hourCondition,
        status: 'active'
      };

      // Remove call_timestamp from dateFilter.condition if it exists to avoid conflicts
      if (whereClause.call_timestamp && dateFilter.condition.call_timestamp) {
        // We need to handle both date range and hour condition
        // Use Op.and to combine both conditions
        whereClause[Op.and] = [
          dateFilter.condition.call_timestamp,
          hourCondition
        ];
        delete whereClause.call_timestamp;
      }

      const [totalCalls, connectedCalls] = await Promise.all([
        CallLog.count({
          where: whereClause,
          transaction
        }),
        CallLog.count({
          where: {
            ...whereClause,
            call_type: 'OUTGOING',
            call_status: 'ANSWERED'
          },
          transaction
        })
      ]);

      const connectivityRate = totalCalls > 0 
        ? ((connectedCalls / totalCalls) * 100).toFixed(2)
        : '0';

      return {
        hour: slot.label,
        total: totalCalls,
        connected: connectedCalls,
        rate: parseFloat(connectivityRate)
      };
    })
  );

  return timeAnalysis;
}

module.exports = {
    buildDateFilter,
    buildEmployeeFilter,
    getKPIMetrics,
    getAgentPerformance,
    getTimeAnalysis
}