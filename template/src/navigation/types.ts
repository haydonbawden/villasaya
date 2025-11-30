import type { Path } from './paths';
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { StackScreenProps } from '@react-navigation/stack';

import { Paths } from './paths';

export type AnyPath = Path;

export type AppTabParamList = {
  [Paths.TabCalendar]: NavigatorScreenParams<CalendarStackParamList>;
  [Paths.TabChat]: NavigatorScreenParams<ChatStackParamList>;
  [Paths.TabDashboard]: NavigatorScreenParams<DashboardStackParamList>;
  [Paths.TabMore]: NavigatorScreenParams<MoreStackParamList>;
  [Paths.TabTasks]: NavigatorScreenParams<TasksStackParamList>;
};

export type CalendarStackParamList = {
  [Paths.AutoScheduler]: undefined;
  [Paths.CalendarView]: undefined;
  [Paths.EventDetails]: undefined;
  [Paths.HolidayList]: undefined;
  [Paths.RosterBuilder]: undefined;
  [Paths.StaffSchedules]: undefined;
};

export type ChatStackParamList = {
  [Paths.ChatList]: undefined;
  [Paths.ChatRoom]: undefined;
  [Paths.GroupCreation]: undefined;
  [Paths.MediaAttachments]: undefined;
  [Paths.VoiceRecording]: undefined;
};

export type DashboardStackParamList = {
  [Paths.AddStaff]: undefined;
  [Paths.Attendance]: undefined;
  [Paths.Dashboard]: undefined;
  [Paths.EmploymentDetails]: undefined;
  [Paths.LeaseManagement]: undefined;
  [Paths.LeaveManager]: undefined;
  [Paths.LeaveRequest]: undefined;
  [Paths.StaffList]: undefined;
  [Paths.StaffProfile]: undefined;
  [Paths.StaffSchedules]: undefined;
};

export type MoreStackParamList = {
  [Paths.AnalyticsDashboard]: undefined;
  [Paths.Approval]: undefined;
  [Paths.ClaimDetail]: undefined;
  [Paths.ClaimsList]: undefined;
  [Paths.ContactDetail]: undefined;
  [Paths.ContactForm]: undefined;
  [Paths.ContactList]: undefined;
  [Paths.DocumentCategories]: undefined;
  [Paths.DocumentList]: undefined;
  [Paths.DocumentViewer]: undefined;
  [Paths.ExportReports]: undefined;
  [Paths.IncidentDetail]: undefined;
  [Paths.IncidentList]: undefined;
  [Paths.LeaseManagement]: undefined;
  [Paths.MediaCapture]: undefined;
  [Paths.MonthlyReport]: undefined;
  [Paths.PdfExport]: undefined;
  [Paths.ReceiptScanner]: undefined;
  [Paths.SubmitClaim]: undefined;
  [Paths.SubmitIncident]: undefined;
  [Paths.UploadDocument]: undefined;
};

export type RootScreenProps<
  S extends keyof RootStackParamList = keyof RootStackParamList,
> = StackScreenProps<RootStackParamList, S>;

export type RootStackParamList = {
  [Paths.AppTabs]: NavigatorScreenParams<AppTabParamList>;
  [Paths.AuthConfiguration]: undefined;
  [Paths.AuthLoginSignup]: undefined;
  [Paths.AuthProfileSetup]: undefined;
  [Paths.AuthRoleSelection]: undefined;
  [Paths.AuthWelcome]: undefined;
};

export type TasksStackParamList = {
  [Paths.Checklist]: undefined;
  [Paths.PhotoUploader]: undefined;
  [Paths.RecurringTask]: undefined;
  [Paths.TaskCreate]: undefined;
  [Paths.TaskDetail]: undefined;
  [Paths.TaskList]: undefined;
  [Paths.TemplateLibrary]: undefined;
};
