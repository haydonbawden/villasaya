import type {
  AppTabParamList,
  CalendarStackParamList,
  ChatStackParamList,
  DashboardStackParamList,
  MoreStackParamList,
  RootStackParamList,
  TasksStackParamList,
} from '@/navigation/types';

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Paths } from '@/navigation/paths';
import { useTheme } from '@/theme';

import AnalyticsDashboardScreen from '@/modules/analytics/screens/AnalyticsDashboardScreen';
import MonthlyReportScreen from '@/modules/analytics/screens/MonthlyReportScreen';
import PdfExportScreen from '@/modules/analytics/screens/PdfExportScreen';
import ConfigurationWizardScreen from '@/modules/auth/screens/ConfigurationWizardScreen';
import LoginSignupScreen from '@/modules/auth/screens/LoginSignupScreen';
import ProfileSetupScreen from '@/modules/auth/screens/ProfileSetupScreen';
import RoleSelectionScreen from '@/modules/auth/screens/RoleSelectionScreen';
import WelcomeScreen from '@/modules/auth/screens/WelcomeScreen';
import AutoSchedulerScreen from '@/modules/calendar/screens/AutoSchedulerScreen';
import CalendarViewScreen from '@/modules/calendar/screens/CalendarViewScreen';
import EventDetailsScreen from '@/modules/calendar/screens/EventDetailsScreen';
import HolidayListScreen from '@/modules/calendar/screens/HolidayListScreen';
import RosterBuilderScreen from '@/modules/calendar/screens/RosterBuilderScreen';
import ChatListScreen from '@/modules/chat/screens/ChatListScreen';
import ChatRoomScreen from '@/modules/chat/screens/ChatRoomScreen';
import GroupCreationScreen from '@/modules/chat/screens/GroupCreationScreen';
import MediaAttachmentsScreen from '@/modules/chat/screens/MediaAttachmentsScreen';
import VoiceRecordingScreen from '@/modules/chat/screens/VoiceRecordingScreen';
import ApprovalScreen from '@/modules/claims/screens/ApprovalScreen';
import ClaimDetailScreen from '@/modules/claims/screens/ClaimDetailScreen';
import ClaimsListScreen from '@/modules/claims/screens/ClaimsListScreen';
import ExportReportsScreen from '@/modules/claims/screens/ExportReportsScreen';
import ReceiptScannerScreen from '@/modules/claims/screens/ReceiptScannerScreen';
import SubmitClaimScreen from '@/modules/claims/screens/SubmitClaimScreen';
import ContactDetailScreen from '@/modules/contacts/screens/ContactDetailScreen';
import ContactFormScreen from '@/modules/contacts/screens/ContactFormScreen';
import ContactListScreen from '@/modules/contacts/screens/ContactListScreen';
import DocumentCategoriesScreen from '@/modules/documents/screens/DocumentCategoriesScreen';
import DocumentListScreen from '@/modules/documents/screens/DocumentListScreen';
import DocumentViewerScreen from '@/modules/documents/screens/DocumentViewerScreen';
import UploadDocumentScreen from '@/modules/documents/screens/UploadDocumentScreen';
import IncidentDetailScreen from '@/modules/notifications/screens/IncidentDetailScreen';
import IncidentListScreen from '@/modules/notifications/screens/IncidentListScreen';
import MediaCaptureScreen from '@/modules/notifications/screens/MediaCaptureScreen';
import SubmitIncidentScreen from '@/modules/notifications/screens/SubmitIncidentScreen';
import AddStaffScreen from '@/modules/staff/screens/AddStaffScreen';
import AttendanceCheckInScreen from '@/modules/staff/screens/AttendanceCheckInScreen';
import EmploymentDetailsScreen from '@/modules/staff/screens/EmploymentDetailsScreen';
import LeaveManagerScreen from '@/modules/staff/screens/LeaveManagerScreen';
import LeaveRequestScreen from '@/modules/staff/screens/LeaveRequestScreen';
import StaffListScreen from '@/modules/staff/screens/StaffListScreen';
import StaffProfileScreen from '@/modules/staff/screens/StaffProfileScreen';
import StaffSchedulesScreen from '@/modules/staff/screens/StaffSchedulesScreen';
import ChecklistScreen from '@/modules/tasks/screens/ChecklistScreen';
import PhotoUploaderScreen from '@/modules/tasks/screens/PhotoUploaderScreen';
import RecurringTaskScreen from '@/modules/tasks/screens/RecurringTaskScreen';
import TaskCreateScreen from '@/modules/tasks/screens/TaskCreateScreen';
import TaskDetailScreen from '@/modules/tasks/screens/TaskDetailScreen';
import TaskListScreen from '@/modules/tasks/screens/TaskListScreen';
import TemplateLibraryScreen from '@/modules/tasks/screens/TemplateLibraryScreen';
import DashboardScreen from '@/modules/users/screens/DashboardScreen';
import LeaseManagementScreen from '@/modules/users/screens/LeaseManagementScreen';

const RootStack = createStackNavigator<RootStackParamList>();
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
const Tab = createBottomTabNavigator<AppTabParamList>();
const DashboardStack = createStackNavigator<DashboardStackParamList>();
const TasksStack = createStackNavigator<TasksStackParamList>();
const CalendarStack = createStackNavigator<CalendarStackParamList>();
const ChatStack = createStackNavigator<ChatStackParamList>();
const MoreStack = createStackNavigator<MoreStackParamList>();

function ApplicationNavigator() {
  const { navigationTheme, variant } = useTheme();

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={navigationTheme}>
        <RootStack.Navigator key={variant} screenOptions={{ headerShown: false }}>
          <RootStack.Screen component={WelcomeScreen} name={Paths.AuthWelcome} />
          <RootStack.Screen component={LoginSignupScreen} name={Paths.AuthLoginSignup} />
          <RootStack.Screen component={RoleSelectionScreen} name={Paths.AuthRoleSelection} />
          <RootStack.Screen component={ProfileSetupScreen} name={Paths.AuthProfileSetup} />
          <RootStack.Screen component={ConfigurationWizardScreen} name={Paths.AuthConfiguration} />
          <RootStack.Screen component={AppTabs} name={Paths.AppTabs} />
        </RootStack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

function AppTabs() {
  const { colors, fonts, gutters } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.purple500,
        tabBarLabelStyle: fonts.size_12,
        tabBarStyle: { paddingVertical: gutters.paddingVertical_12.paddingVertical },
      }}
    >
      <Tab.Screen component={DashboardNavigator} name={Paths.TabDashboard} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen component={TasksNavigator} name={Paths.TabTasks} options={{ tabBarLabel: 'Tasks' }} />
      <Tab.Screen component={CalendarNavigator} name={Paths.TabCalendar} options={{ tabBarLabel: 'Calendar' }} />
      <Tab.Screen component={ChatNavigator} name={Paths.TabChat} options={{ tabBarLabel: 'Chat' }} />
      <Tab.Screen component={MoreNavigator} name={Paths.TabMore} options={{ tabBarLabel: 'More' }} />
    </Tab.Navigator>
  );
}

function CalendarNavigator() {
  return (
    <CalendarStack.Navigator screenOptions={{ headerShown: false }}>
      <CalendarStack.Screen component={CalendarViewScreen} name={Paths.CalendarView} />
      <CalendarStack.Screen component={RosterBuilderScreen} name={Paths.RosterBuilder} />
      <CalendarStack.Screen component={AutoSchedulerScreen} name={Paths.AutoScheduler} />
      <CalendarStack.Screen component={EventDetailsScreen} name={Paths.EventDetails} />
      <CalendarStack.Screen component={HolidayListScreen} name={Paths.HolidayList} />
      <CalendarStack.Screen component={StaffSchedulesScreen} name={Paths.StaffSchedules} />
    </CalendarStack.Navigator>
  );
}

function ChatNavigator() {
  return (
    <ChatStack.Navigator screenOptions={{ headerShown: false }}>
      <ChatStack.Screen component={ChatListScreen} name={Paths.ChatList} />
      <ChatStack.Screen component={ChatRoomScreen} name={Paths.ChatRoom} />
      <ChatStack.Screen component={GroupCreationScreen} name={Paths.GroupCreation} />
      <ChatStack.Screen component={VoiceRecordingScreen} name={Paths.VoiceRecording} />
      <ChatStack.Screen component={MediaAttachmentsScreen} name={Paths.MediaAttachments} />
    </ChatStack.Navigator>
  );
}

function DashboardNavigator() {
  return (
    <DashboardStack.Navigator screenOptions={{ headerShown: false }}>
      <DashboardStack.Screen component={DashboardScreen} name={Paths.Dashboard} />
      <DashboardStack.Screen component={LeaseManagementScreen} name={Paths.LeaseManagement} />
      <DashboardStack.Screen component={StaffListScreen} name={Paths.StaffList} />
      <DashboardStack.Screen component={StaffProfileScreen} name={Paths.StaffProfile} />
      <DashboardStack.Screen component={EmploymentDetailsScreen} name={Paths.EmploymentDetails} />
      <DashboardStack.Screen component={AddStaffScreen} name={Paths.AddStaff} />
      <DashboardStack.Screen component={AttendanceCheckInScreen} name={Paths.Attendance} />
      <DashboardStack.Screen component={StaffSchedulesScreen} name={Paths.StaffSchedules} />
      <DashboardStack.Screen component={LeaveRequestScreen} name={Paths.LeaveRequest} />
      <DashboardStack.Screen component={LeaveManagerScreen} name={Paths.LeaveManager} />
    </DashboardStack.Navigator>
  );
}

function MoreNavigator() {
  return (
    <MoreStack.Navigator screenOptions={{ headerShown: false }}>
      <MoreStack.Screen component={ClaimsListScreen} name={Paths.ClaimsList} />
      <MoreStack.Screen component={SubmitClaimScreen} name={Paths.SubmitClaim} />
      <MoreStack.Screen component={ReceiptScannerScreen} name={Paths.ReceiptScanner} />
      <MoreStack.Screen component={ApprovalScreen} name={Paths.Approval} />
      <MoreStack.Screen component={ClaimDetailScreen} name={Paths.ClaimDetail} />
      <MoreStack.Screen component={ExportReportsScreen} name={Paths.ExportReports} />
      <MoreStack.Screen component={DocumentCategoriesScreen} name={Paths.DocumentCategories} />
      <MoreStack.Screen component={DocumentListScreen} name={Paths.DocumentList} />
      <MoreStack.Screen component={UploadDocumentScreen} name={Paths.UploadDocument} />
      <MoreStack.Screen component={DocumentViewerScreen} name={Paths.DocumentViewer} />
      <MoreStack.Screen component={ContactListScreen} name={Paths.ContactList} />
      <MoreStack.Screen component={ContactDetailScreen} name={Paths.ContactDetail} />
      <MoreStack.Screen component={ContactFormScreen} name={Paths.ContactForm} />
      <MoreStack.Screen component={IncidentListScreen} name={Paths.IncidentList} />
      <MoreStack.Screen component={IncidentDetailScreen} name={Paths.IncidentDetail} />
      <MoreStack.Screen component={SubmitIncidentScreen} name={Paths.SubmitIncident} />
      <MoreStack.Screen component={MediaCaptureScreen} name={Paths.MediaCapture} />
      <MoreStack.Screen component={AnalyticsDashboardScreen} name={Paths.AnalyticsDashboard} />
      <MoreStack.Screen component={MonthlyReportScreen} name={Paths.MonthlyReport} />
      <MoreStack.Screen component={PdfExportScreen} name={Paths.PdfExport} />
      <MoreStack.Screen component={LeaseManagementScreen} name={Paths.LeaseManagement} />
    </MoreStack.Navigator>
  );
}

function TasksNavigator() {
  return (
    <TasksStack.Navigator screenOptions={{ headerShown: false }}>
      <TasksStack.Screen component={TaskListScreen} name={Paths.TaskList} />
      <TasksStack.Screen component={TaskDetailScreen} name={Paths.TaskDetail} />
      <TasksStack.Screen component={TaskCreateScreen} name={Paths.TaskCreate} />
      <TasksStack.Screen component={ChecklistScreen} name={Paths.Checklist} />
      <TasksStack.Screen component={PhotoUploaderScreen} name={Paths.PhotoUploader} />
      <TasksStack.Screen component={TemplateLibraryScreen} name={Paths.TemplateLibrary} />
      <TasksStack.Screen component={RecurringTaskScreen} name={Paths.RecurringTask} />
    </TasksStack.Navigator>
  );
}

export default ApplicationNavigator;
